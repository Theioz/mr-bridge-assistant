"use client";

import { useState, useRef, useCallback, useMemo, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import type {
  BacklogItem,
  BacklogStatus,
  MediaType,
  MetadataSearchResult,
  AllCounts,
} from "@/lib/types";
import { buildApiUrl, getGenres, type ImportExtras, type SortKey, type Tab } from "./shared";

// Library list state: the active tab, filters and sort, the per-tab item cache with
// pagination, and every handler that mutates the list (import, bulk import, drag
// reorder, delete). Split out of LibraryClient (#777); the logic is unchanged.
export function useLibraryItems({
  initialItems,
  initialCounts,
  searchMediaType,
}: {
  initialItems: BacklogItem[];
  initialCounts: AllCounts;
  /** Media type of the open search modal, if any; decides what handleImport adds. */
  searchMediaType: MediaType | null;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // ── UI state ────────────────────────────────────────────────────────────────
  const validTabs: Tab[] = ["all", "game", "show", "movie", "book"];
  const paramTab = searchParams.get("tab") as Tab | null;
  const [activeTab, setActiveTab] = useState<Tab>(
    paramTab && validTabs.includes(paramTab) ? paramTab : "all",
  );
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState<string | null>(null);
  const [filterGenre, setFilterGenre] = useState<string | null>(null);
  const [filterYear, setFilterYear] = useState<string | null>(null);
  const [sortBy, setSortBy] = useState<SortKey>("rating");
  const dragId = useRef<string | null>(null);
  const dragOverId = useRef<string | null>(null);

  // ── Pagination + lazy-load state ────────────────────────────────────────────
  // Global counts — used by SummaryStrip and tab badges (never stale from pagination)
  const [counts, setCounts] = useState<AllCounts>(initialCounts);

  // Per-tab item cache (ref — no renders triggered by cache writes)
  const tabCacheRef = useRef<Partial<Record<Tab, BacklogItem[]>>>({ all: initialItems });
  // Per-tab "has more pages" tracking (ref — only hasMore state triggers render)
  const tabHasMoreRef = useRef<Record<Tab, boolean>>({
    all: initialItems.length >= 50,
    game: true,
    show: true,
    movie: true,
    book: true,
  });
  // Current tab ref — lets effects read latest tab without depending on it
  const activeTabRef = useRef<Tab>(
    paramTab && validTabs.includes(paramTab) ? (paramTab as Tab) : "all",
  );

  // Displayed items + pagination
  // initialItems is always the "all" tab SSR data; if URL lands on a specific tab we'll
  // fetch the correct items in the mount effect below.
  const [displayedItems, setDisplayedItems] = useState<BacklogItem[]>(
    !paramTab || paramTab === "all" ? initialItems : [],
  );
  // API-level offset (pre genre-filter); used for Load More requests
  const [displayedOffset, setDisplayedOffset] = useState(initialItems.length);
  const [hasMore, setHasMore] = useState(initialItems.length >= 50);
  const [tabLoading, setTabLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const filterTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Derived ─────────────────────────────────────────────────────────────────
  const hasServerFilter = !!(searchQuery || filterStatus || filterYear);
  const hasFilter = !!(searchQuery || filterStatus || filterGenre || filterYear);
  const canDrag = activeTab !== "all" && sortBy === "priority" && !hasFilter;
  const showType = activeTab === "all";

  // Client-side sort applied on top of whatever the server returned
  const sortedDisplayedItems = useMemo(() => {
    if (sortBy === "title")
      return [...displayedItems].sort((a, b) => a.title.localeCompare(b.title));
    if (sortBy === "rating")
      return [...displayedItems].sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
    if (sortBy === "release_date")
      return [...displayedItems].sort((a, b) =>
        (b.release_date ?? "").localeCompare(a.release_date ?? ""),
      );
    return displayedItems; // priority order already from server
  }, [displayedItems, sortBy]);

  // Genre + year dropdowns derived from loaded items
  const availableGenres = useMemo(() => {
    const set = new Set<string>();
    displayedItems.forEach((item) => getGenres(item).forEach((g) => set.add(g)));
    return Array.from(set).sort();
  }, [displayedItems]);

  const availableYears = useMemo(() => {
    const set = new Set<string>();
    displayedItems.forEach((item) => {
      if (item.release_date) set.add(item.release_date.slice(0, 4));
    });
    return Array.from(set).sort().reverse();
  }, [displayedItems]);

  // ── Mount effect — fetch correct items when URL lands on a non-"all" tab ────
  useEffect(() => {
    const tab = activeTabRef.current;
    if (tab === "all") return; // initialItems already covers "all"
    let cancelled = false;
    setTabLoading(true);
    fetch(`/api/backlog?limit=50&offset=0&type=${tab}`)
      .then((r) => r.json())
      .then((data: { items: BacklogItem[] }) => {
        if (cancelled) return;
        tabCacheRef.current = { ...tabCacheRef.current, [tab]: data.items };
        tabHasMoreRef.current = { ...tabHasMoreRef.current, [tab]: data.items.length >= 50 };
        setDisplayedItems(data.items);
        setDisplayedOffset(data.items.length);
        setHasMore(data.items.length >= 50);
      })
      .catch(() => {})
      .finally(() => {
        if (!cancelled) setTabLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // ── Tab switch ──────────────────────────────────────────────────────────────
  const handleTabSwitch = useCallback(
    async (tab: Tab) => {
      setActiveTab(tab);
      activeTabRef.current = tab;
      router.replace(tab === "all" ? "/library" : `/library?tab=${tab}`, { scroll: false });
      setFilterGenre(null);
      setFilterYear(null);

      // searchQuery + filterStatus may still be active — check them before clearing
      const serverFilterActive = !!(searchQuery || filterStatus);

      if (!serverFilterActive) {
        // No server filter — use cache or fetch unfiltered
        const cached = tabCacheRef.current[tab];
        if (cached !== undefined) {
          setDisplayedItems(cached);
          setDisplayedOffset(cached.length);
          setHasMore(tabHasMoreRef.current[tab] ?? false);
          return;
        }
        setTabLoading(true);
        try {
          const url = `/api/backlog?limit=50&offset=0${tab !== "all" ? `&type=${tab}` : ""}`;
          const data = (await fetch(url).then((r) => r.json())) as { items: BacklogItem[] };
          tabCacheRef.current = { ...tabCacheRef.current, [tab]: data.items };
          tabHasMoreRef.current = { ...tabHasMoreRef.current, [tab]: data.items.length >= 50 };
          setDisplayedItems(data.items);
          setDisplayedOffset(data.items.length);
          setHasMore(data.items.length >= 50);
        } catch {
          // silent — display stays as-is
        } finally {
          setTabLoading(false);
        }
      } else {
        // Server filter active — fetch with filter + new tab (filterYear/genre just cleared above)
        setTabLoading(true);
        try {
          const url = buildApiUrl(tab, searchQuery || null, filterStatus, null, 0);
          const data = (await fetch(url).then((r) => r.json())) as { items: BacklogItem[] };
          setDisplayedItems(data.items);
          setDisplayedOffset(data.items.length);
          setHasMore(data.items.length >= 50);
        } catch {
          // silent
        } finally {
          setTabLoading(false);
        }
      }
    },
    [searchQuery, filterStatus],
  );

  // ── Filter effect ───────────────────────────────────────────────────────────
  // Fires on filter value changes only (not on tab changes — those go through handleTabSwitch).
  // Reads activeTabRef to get the current tab without creating a dependency on activeTab state.
  useEffect(() => {
    if (filterTimerRef.current) clearTimeout(filterTimerRef.current);

    const tab = activeTabRef.current;

    if (!hasServerFilter && !filterGenre) {
      // No filter — restore from cache (handles the "filter cleared" case)
      const cached = tabCacheRef.current[tab];
      if (cached !== undefined) {
        setDisplayedItems(cached);
        setDisplayedOffset(cached.length);
        setHasMore(tabHasMoreRef.current[tab] ?? false);
      } else {
        // Cache miss (e.g. filter cleared on a tab that was only ever visited with a filter)
        setTabLoading(true);
        const url = `/api/backlog?limit=50&offset=0${tab !== "all" ? `&type=${tab}` : ""}`;
        fetch(url)
          .then((r) => r.json())
          .then(({ items }: { items: BacklogItem[] }) => {
            tabCacheRef.current = { ...tabCacheRef.current, [tab]: items };
            tabHasMoreRef.current = { ...tabHasMoreRef.current, [tab]: items.length >= 50 };
            setDisplayedItems(items);
            setDisplayedOffset(items.length);
            setHasMore(items.length >= 50);
          })
          .catch(() => {})
          .finally(() => setTabLoading(false));
      }
      return;
    }

    if (!hasServerFilter && filterGenre) {
      // Genre-only — client-side post-filter on cached items
      const source = tabCacheRef.current[tab] ?? [];
      setDisplayedItems(source.filter((i) => getGenres(i).includes(filterGenre)));
      setDisplayedOffset(source.length);
      // Show Load More based on whether there are more unfiltered pages (genre can't paginate server-side)
      setHasMore(tabHasMoreRef.current[tab] ?? false);
      return;
    }

    // Server filter — debounce text search, fire immediately for dropdowns
    const delay = searchQuery ? 300 : 0;
    filterTimerRef.current = setTimeout(async () => {
      setTabLoading(true);
      try {
        const url = buildApiUrl(tab, searchQuery || null, filterStatus, filterYear, 0);
        const data = (await fetch(url).then((r) => r.json())) as { items: BacklogItem[] };
        const postFiltered = filterGenre
          ? data.items.filter((i) => getGenres(i).includes(filterGenre))
          : data.items;
        setDisplayedItems(postFiltered);
        setDisplayedOffset(data.items.length);
        setHasMore(data.items.length >= 50);
      } catch {
        // silent
      } finally {
        setTabLoading(false);
      }
    }, delay);

    return () => {
      if (filterTimerRef.current) clearTimeout(filterTimerRef.current);
    };
  }, [searchQuery, filterStatus, filterGenre, filterYear, hasServerFilter]);

  // ── Load more ───────────────────────────────────────────────────────────────
  const loadMoreItems = async () => {
    if (loadingMore) return;
    setLoadingMore(true);
    try {
      const tab = activeTabRef.current;
      const url = buildApiUrl(tab, searchQuery || null, filterStatus, filterYear, displayedOffset);
      const data = (await fetch(url).then((r) => r.json())) as { items: BacklogItem[] };
      const newItems = data.items;

      if (!hasServerFilter) {
        const existing = tabCacheRef.current[tab] ?? [];
        tabCacheRef.current = { ...tabCacheRef.current, [tab]: [...existing, ...newItems] };
        tabHasMoreRef.current = { ...tabHasMoreRef.current, [tab]: newItems.length >= 50 };
      }

      const postFiltered = filterGenre
        ? newItems.filter((i) => getGenres(i).includes(filterGenre))
        : newItems;
      setDisplayedItems((prev) => [...prev, ...postFiltered]);
      setDisplayedOffset((prev) => prev + newItems.length);
      setHasMore(newItems.length >= 50);
    } catch {
      // silent
    } finally {
      setLoadingMore(false);
    }
  };

  // ── Import handler ──────────────────────────────────────────────────────────
  const handleImport = async (result: MetadataSearchResult, extras: ImportExtras) => {
    const mediaType = searchMediaType ?? (activeTab === "all" ? "game" : activeTab);
    const res = await fetch("/api/backlog", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        media_type: mediaType,
        title: result.title,
        creator: result.creator || null,
        release_date: result.release_date,
        description: result.description || null,
        cover_url: result.cover_url || null,
        external_id: result.external_id || null,
        external_source: result.external_source || "manual",
        metadata: {
          ...result.metadata,
          ...(extras.platform ? { played_on: extras.platform } : {}),
          ...(extras.price_paid != null ? { price_paid: extras.price_paid } : {}),
        },
        status: extras.status,
        rating: extras.rating,
        review: extras.review,
      }),
    });
    if (!res.ok) return;
    const newItem = (await res.json()) as BacklogItem;
    if (extras.session) {
      await fetch(`/api/backlog/${newItem.id}/sessions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(extras.session),
      });
    }
    // Optimistic update — prepend to displayed list and both caches
    setDisplayedItems((prev) => [newItem, ...prev]);
    const allCached = tabCacheRef.current["all"];
    if (allCached) tabCacheRef.current = { ...tabCacheRef.current, all: [newItem, ...allCached] };
    const tab = activeTabRef.current;
    if (tab !== "all") {
      const tabCached = tabCacheRef.current[tab];
      if (tabCached)
        tabCacheRef.current = { ...tabCacheRef.current, [tab]: [newItem, ...tabCached] };
    }
    // Update global counts
    const st = extras.status as BacklogStatus;
    setCounts((prev) => ({
      ...prev,
      all: { ...prev.all, [st]: (prev.all[st] as number) + 1, total: prev.all.total + 1 },
      [mediaType]: {
        ...prev[mediaType as MediaType],
        [st]: ((prev[mediaType as MediaType] as Record<string, number>)[st] ?? 0) + 1,
        total: prev[mediaType as MediaType].total + 1,
      },
    }));
    router.refresh();
    router.push(`/library/${newItem.id}`);
  };

  // A CSV import can land hundreds of rows across several media types, so patching the
  // caches item by item is not worth it — drop them and refetch the tab in view.
  const handleBulkImported = (inserted: BacklogItem[]) => {
    if (inserted.length === 0) return;

    setCounts((prev) => {
      const next = structuredClone(prev) as AllCounts;
      for (const item of inserted) {
        const st = item.status;
        next.all[st] += 1;
        next.all.total += 1;
        next[item.media_type][st] += 1;
        next[item.media_type].total += 1;
      }
      return next;
    });

    const tab = activeTabRef.current;
    tabCacheRef.current = {};
    // Every stack just grew, so assume more to page in until a fetch says otherwise.
    tabHasMoreRef.current = { all: true, game: true, show: true, movie: true, book: true };
    setTabLoading(true);
    fetch(buildApiUrl(tab, searchQuery || null, filterStatus, filterYear, 0))
      .then((r) => r.json())
      .then((data: { items: BacklogItem[] }) => {
        tabCacheRef.current = { ...tabCacheRef.current, [tab]: data.items };
        tabHasMoreRef.current = { ...tabHasMoreRef.current, [tab]: data.items.length >= 50 };
        setDisplayedItems(data.items);
        setDisplayedOffset(data.items.length);
        setHasMore(data.items.length >= 50);
      })
      .catch(() => {})
      .finally(() => setTabLoading(false));

    router.refresh();
  };

  // ── Drag reorder ────────────────────────────────────────────────────────────
  const handleDragStart = (id: string) => {
    dragId.current = id;
  };
  const handleDragOver = (_e: React.DragEvent, id: string) => {
    dragOverId.current = id;
  };
  const handleDrop = async (targetId: string) => {
    const srcId = dragId.current;
    if (!srcId || srcId === targetId) return;

    const srcIdx = displayedItems.findIndex((i) => i.id === srcId);
    const tgtIdx = displayedItems.findIndex((i) => i.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;

    const prevItems = [...displayedItems];
    const reordered = [...displayedItems];
    const [moved] = reordered.splice(srcIdx, 1);
    reordered.splice(tgtIdx, 0, moved);
    const updated = reordered.map((item, idx) => ({ ...item, priority: idx }));

    setDisplayedItems(updated);
    const tab = activeTabRef.current;
    tabCacheRef.current = { ...tabCacheRef.current, [tab]: updated };

    await Promise.all(
      updated
        .filter((item, idx) => item.priority !== prevItems[idx]?.priority)
        .map((item) =>
          fetch(`/api/backlog/${item.id}/priority`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ priority: item.priority }),
          }),
        ),
    );

    dragId.current = null;
    dragOverId.current = null;
  };

  // ── Delete item ─────────────────────────────────────────────────────────────
  const handleDeleteItem = (id: string) => {
    setDisplayedItems((prev) => prev.filter((i) => i.id !== id));
    const tab = activeTabRef.current;
    tabCacheRef.current = {
      ...tabCacheRef.current,
      all: (tabCacheRef.current.all ?? []).filter((i) => i.id !== id),
      [tab]: (tabCacheRef.current[tab] ?? []).filter((i) => i.id !== id),
    };
    const deletedItem = displayedItems.find((i) => i.id === id);
    if (deletedItem) {
      const mt = deletedItem.media_type as MediaType;
      const st = deletedItem.status as BacklogStatus;
      setCounts((prev) => ({
        ...prev,
        all: {
          ...prev.all,
          [st]: Math.max(0, (prev.all[st] as number) - 1),
          total: Math.max(0, prev.all.total - 1),
        },
        [mt]: {
          ...prev[mt],
          [st]: Math.max(0, (prev[mt][st] as number) - 1),
          total: Math.max(0, prev[mt].total - 1),
        },
      }));
    }
  };

  // ── Filter helpers ──────────────────────────────────────────────────────────
  const clearFilters = () => {
    setSearchQuery("");
    setFilterStatus(null);
    setFilterGenre(null);
    setFilterYear(null);
  };

  return {
    activeTab,
    searchQuery,
    setSearchQuery,
    filterStatus,
    setFilterStatus,
    filterGenre,
    setFilterGenre,
    filterYear,
    setFilterYear,
    sortBy,
    setSortBy,
    counts,
    displayedItems,
    sortedDisplayedItems,
    availableGenres,
    availableYears,
    hasMore,
    tabLoading,
    loadingMore,
    hasFilter,
    canDrag,
    showType,
    handleTabSwitch,
    loadMoreItems,
    handleImport,
    handleBulkImported,
    handleDragStart,
    handleDragOver,
    handleDrop,
    handleDeleteItem,
    clearFilters,
  };
}
