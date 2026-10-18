"use client";

import { useState } from "react";
import { Plus, LayoutGrid, List, Upload } from "lucide-react";
import type { BacklogItem, MediaType, AllCounts } from "@/lib/types";
import ImportModal from "./ImportModal";
import { TABS, type ViewMode } from "./shared";
import { useLibraryItems } from "./useLibraryItems";
import SummaryStrip from "./components/SummaryStrip";
import TypePickerModal from "./components/TypePickerModal";
import SearchModal from "./components/SearchModal";
import ItemRow from "./components/ItemRow";
import CoverGrid from "./components/CoverGrid";
import ShareButton from "./components/ShareButton";
import LibraryFilterBar from "./components/LibraryFilterBar";

// ── Main component ────────────────────────────────────────────────────────────

export default function LibraryClient({
  initialItems,
  initialCounts,
  initialShareToken,
  shareBase,
  ratePrompts,
}: {
  initialItems: BacklogItem[];
  initialCounts: AllCounts;
  initialShareToken: string | null;
  /** Public share origin, resolved on the server by `shareBaseUrl()` (#761). */
  shareBase: string;
  ratePrompts?: React.ReactNode;
}) {
  // ── UI state ────────────────────────────────────────────────────────────────
  const [viewMode, setViewMode] = useState<ViewMode>("list");
  const [showTypePicker, setShowTypePicker] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [searchMediaType, setSearchMediaType] = useState<MediaType | null>(null);
  // Snapshot frozen when the search modal opens — prevents false-positive duplicate badges
  // when handleImport prepends the new item to displayedItems before navigating away.
  const [existingItemsSnapshot, setExistingItemsSnapshot] = useState<BacklogItem[]>([]);

  const {
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
  } = useLibraryItems({ initialItems, initialCounts, searchMediaType });

  // ── Grouped items for list view ─────────────────────────────────────────────
  const activeItems = sortedDisplayedItems.filter((i) => i.status === "active");
  const queuedItems = sortedDisplayedItems.filter((i) => i.status === "backlog");
  const pausedItems = sortedDisplayedItems.filter((i) => i.status === "paused");
  const finishedItems = sortedDisplayedItems.filter((i) => i.status === "finished");
  const droppedItems = sortedDisplayedItems.filter((i) => i.status === "dropped");

  const tabTotal = counts[activeTab].total;

  // ── Render ──────────────────────────────────────────────────────────────────
  return (
    <div>
      {/* Header */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "space-between",
          marginBottom: 20,
        }}
      >
        <div>
          <h1
            className="font-heading"
            style={{
              fontSize: "var(--t-h1)",
              fontWeight: 600,
              margin: 0,
              color: "var(--color-text)",
            }}
          >
            Library
          </h1>
          <p
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-muted)",
              margin: "4px 0 0",
            }}
          >
            Your personal media collection
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* View toggle */}
          <div
            style={{
              display: "flex",
              border: "1px solid var(--rule-soft)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          >
            {(["list", "grid"] as ViewMode[]).map((mode) => (
              <button
                key={mode}
                onClick={() => setViewMode(mode)}
                style={{
                  background: viewMode === mode ? "var(--color-bg-2)" : "transparent",
                  border: "none",
                  cursor: "pointer",
                  padding: "7px 10px",
                  display: "flex",
                  alignItems: "center",
                  color: viewMode === mode ? "var(--color-text)" : "var(--color-text-muted)",
                  transition: "background 0.15s, color 0.15s",
                }}
                title={mode === "list" ? "List view" : "Cover view"}
              >
                {mode === "list" ? <List size={15} /> : <LayoutGrid size={15} />}
              </button>
            ))}
          </div>

          {/* Share button */}
          <ShareButton initialShareToken={initialShareToken} shareBase={shareBase} />

          <button
            onClick={() => setShowImport(true)}
            title="Import an IMDb CSV export"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--color-bg-2)",
              color: "var(--color-text)",
              border: "1px solid var(--rule-soft)",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Upload size={15} /> Import
          </button>

          <button
            onClick={() => {
              if (activeTab === "all") {
                setShowTypePicker(true);
              } else {
                setExistingItemsSnapshot(displayedItems);
                setSearchMediaType(activeTab);
              }
            }}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              background: "var(--color-primary)",
              color: "var(--color-text-on-cta)",
              border: "none",
              borderRadius: 8,
              padding: "8px 14px",
              fontSize: 14,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            <Plus size={15} /> Add
          </button>
        </div>
      </div>

      {/* Summary strip — always shows global totals, unaffected by filters */}
      <SummaryStrip counts={counts} activeTab={activeTab} />

      {ratePrompts}

      {/* Tabs */}
      <div
        style={{
          display: "flex",
          gap: 2,
          marginBottom: 16,
          borderBottom: "1px solid var(--rule-soft)",
        }}
      >
        {TABS.map((tab) => {
          const count = counts[tab.id].total;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => handleTabSwitch(tab.id)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                padding: "8px 14px",
                fontSize: "var(--t-meta)",
                fontWeight: isActive ? 600 : 400,
                color: isActive ? "var(--color-text)" : "var(--color-text-muted)",
                borderBottom: isActive ? "2px solid var(--accent)" : "2px solid transparent",
                marginBottom: -1,
                transition: "color 0.15s, border-color 0.15s",
              }}
            >
              {tab.label}
              {count > 0 && (
                <span
                  className="tnum"
                  style={{
                    marginLeft: 6,
                    fontSize: "var(--t-micro)",
                    color: "var(--color-text-faint)",
                    fontWeight: 400,
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          );
        })}
      </div>

      <LibraryFilterBar
        searchQuery={searchQuery}
        setSearchQuery={setSearchQuery}
        filterStatus={filterStatus}
        setFilterStatus={setFilterStatus}
        filterGenre={filterGenre}
        setFilterGenre={setFilterGenre}
        filterYear={filterYear}
        setFilterYear={setFilterYear}
        sortBy={sortBy}
        setSortBy={setSortBy}
        availableGenres={availableGenres}
        availableYears={availableYears}
        clearFilters={clearFilters}
      />

      {/* Tab loading indicator */}
      {tabLoading && (
        <p
          style={{
            padding: "16px 0",
            color: "var(--color-text-muted)",
            fontSize: 14,
            textAlign: "center",
          }}
        >
          Loading…
        </p>
      )}

      {/* Empty state — no items in this tab at all */}
      {!tabLoading && tabTotal === 0 && (
        <div style={{ textAlign: "center", padding: "48px 0", color: "var(--color-text-muted)" }}>
          <p style={{ fontSize: 15 }}>
            Nothing in your library
            {activeTab !== "all"
              ? ` for ${TABS.find((t) => t.id === activeTab)?.label.toLowerCase()}`
              : ""}{" "}
            yet.
          </p>
          <button
            onClick={() => {
              if (activeTab === "all") setShowTypePicker(true);
              else {
                setExistingItemsSnapshot(displayedItems);
                setSearchMediaType(activeTab);
              }
            }}
            style={{
              marginTop: 12,
              background: "none",
              border: "1px solid var(--rule-soft)",
              borderRadius: 8,
              padding: "8px 16px",
              fontSize: 14,
              color: "var(--color-text)",
              cursor: "pointer",
            }}
          >
            Add your first one
          </button>
        </div>
      )}

      {/* No filter results */}
      {!tabLoading && tabTotal > 0 && sortedDisplayedItems.length === 0 && hasFilter && (
        <div style={{ textAlign: "center", padding: "32px 0", color: "var(--color-text-muted)" }}>
          <p style={{ fontSize: 14 }}>No items match the current filters.</p>
          <button
            onClick={clearFilters}
            style={{
              marginTop: 8,
              background: "none",
              border: "none",
              fontSize: 13,
              color: "var(--color-primary)",
              cursor: "pointer",
              textDecoration: "underline",
            }}
          >
            Clear filters
          </button>
        </div>
      )}

      {/* Item list */}
      {!tabLoading && sortedDisplayedItems.length > 0 && (
        <div>
          {viewMode === "grid" ? (
            <CoverGrid items={sortedDisplayedItems} showType={showType} />
          ) : (
            <>
              {activeItems.map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  showType={showType}
                  draggable={canDrag}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDelete={handleDeleteItem}
                />
              ))}
              {[...queuedItems, ...pausedItems, ...finishedItems, ...droppedItems].map((item) => (
                <ItemRow
                  key={item.id}
                  item={item}
                  showType={showType}
                  draggable={canDrag && (item.status === "backlog" || item.status === "paused")}
                  onDragStart={handleDragStart}
                  onDragOver={handleDragOver}
                  onDrop={handleDrop}
                  onDelete={handleDeleteItem}
                />
              ))}
            </>
          )}
        </div>
      )}

      {/* Load More */}
      {!tabLoading && hasMore && sortedDisplayedItems.length > 0 && (
        <div style={{ display: "flex", justifyContent: "center", padding: "24px 0 8px" }}>
          <button
            onClick={loadMoreItems}
            disabled={loadingMore}
            style={{
              background: "var(--color-bg-1)",
              border: "1px solid var(--rule-soft)",
              borderRadius: 8,
              padding: "10px 24px",
              fontSize: 14,
              color: loadingMore ? "var(--color-text-muted)" : "var(--color-text)",
              cursor: loadingMore ? "not-allowed" : "pointer",
              opacity: loadingMore ? 0.7 : 1,
              transition: "opacity 0.15s",
            }}
          >
            {loadingMore ? "Loading…" : "Load more"}
          </button>
        </div>
      )}

      {/* Type picker — shown when adding from the All tab */}
      {showImport && (
        <ImportModal onClose={() => setShowImport(false)} onImported={handleBulkImported} />
      )}

      {showTypePicker && (
        <TypePickerModal
          onSelect={(type) => {
            setShowTypePicker(false);
            setExistingItemsSnapshot(displayedItems);
            setSearchMediaType(type);
          }}
          onClose={() => setShowTypePicker(false)}
        />
      )}

      {/* Search modal */}
      {searchMediaType && (
        <SearchModal
          type={searchMediaType}
          onClose={() => setSearchMediaType(null)}
          onImport={handleImport}
          existingItems={existingItemsSnapshot}
        />
      )}
    </div>
  );
}
