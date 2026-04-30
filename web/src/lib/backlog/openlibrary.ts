import type { MetadataSearchResult } from "@/lib/types";

const OL_BASE = "https://openlibrary.org";
const OL_COVERS = "https://covers.openlibrary.org/b/id";

export async function searchOpenLibrary(query: string): Promise<MetadataSearchResult[]> {
  const url = `${OL_BASE}/search.json?q=${encodeURIComponent(query)}&limit=8&fields=key,title,author_name,first_publish_year,number_of_pages_median,isbn,cover_i,subject,publisher`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) throw new Error(`OpenLibrary ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const results: MetadataSearchResult[] = (data.docs ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (doc: any): MetadataSearchResult => {
      const workKey = (doc.key ?? "").replace("/works/", "");
      const coverId = doc.cover_i;
      const coverUrl = coverId ? `${OL_COVERS}/${coverId}-M.jpg` : "";

      return {
        external_id: workKey,
        external_source: "openlibrary",
        title: doc.title ?? "",
        creator: (doc.author_name ?? [])[0] ?? "",
        release_date: doc.first_publish_year ? `${doc.first_publish_year}-01-01` : null,
        description: "",
        cover_url: coverUrl,
        metadata: {
          page_count: doc.number_of_pages_median ?? undefined,
          isbn: (doc.isbn ?? [])[0] ?? undefined,
          publisher: (doc.publisher ?? [])[0] ?? undefined,
          ol_url: workKey ? `https://openlibrary.org/works/${workKey}` : undefined,
        },
      };
    },
  );

  // If all results lack covers, try Google Books as fallback
  const hasCover = results.some((r) => r.cover_url);
  if (!hasCover) {
    const gbResults = await searchGoogleBooks(query);
    if (gbResults.length > 0) return gbResults;
  }

  return results;
}

async function searchGoogleBooks(query: string): Promise<MetadataSearchResult[]> {
  const apiKey = process.env.GOOGLE_BOOKS_API_KEY;
  const keyParam = apiKey ? `&key=${apiKey}` : "";
  const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=8${keyParam}`;
  const res = await fetch(url, { next: { revalidate: 0 } });
  if (!res.ok) return [];
  const data = await res.json();

  return (data.items ?? []).map(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (item: any): MetadataSearchResult => {
      const info = item.volumeInfo ?? {};
      const coverUrl =
        info.imageLinks?.thumbnail?.replace("http://", "https://") ??
        info.imageLinks?.smallThumbnail?.replace("http://", "https://") ??
        "";
      const isbn =
        (info.industryIdentifiers ?? []).find(
          (i: { type: string }) => i.type === "ISBN_13" || i.type === "ISBN_10",
        )?.identifier ?? undefined;

      return {
        external_id: item.id ?? "",
        external_source: "googlebooks",
        title: info.title ?? "",
        creator: (info.authors ?? [])[0] ?? "",
        release_date: info.publishedDate
          ? info.publishedDate.length === 4
            ? `${info.publishedDate}-01-01`
            : info.publishedDate
          : null,
        description: info.description ?? "",
        cover_url: coverUrl,
        metadata: {
          page_count: info.pageCount ?? undefined,
          isbn,
          publisher: info.publisher ?? undefined,
        },
      };
    },
  );
}
