const AFTERSHIP_BASE = "https://api.aftership.com/v4";

export interface AfterShipTracking {
  id: string | null;
  slug: string | null;
  tag: string | null;
  expected_delivery: string | null;
}

async function request(
  apiKey: string,
  method: string,
  path: string,
  body?: unknown,
): Promise<unknown> {
  const res = await fetch(`${AFTERSHIP_BASE}${path}`, {
    method,
    headers: {
      "aftership-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const json = (await res.json()) as {
    meta: { code: number; message?: string };
    data?: unknown;
  };
  // 4003 = tracking already exists — the response still includes the tracking data
  if (json.meta.code !== 200 && json.meta.code !== 201 && json.meta.code !== 4003) {
    throw new Error(`AfterShip ${json.meta.code}: ${json.meta.message ?? JSON.stringify(json)}`);
  }
  return json.data;
}

function parseTracking(data: unknown): AfterShipTracking {
  const t =
    ((data as { tracking?: Record<string, unknown> } | null)?.tracking as Record<
      string,
      unknown
    >) ?? {};
  return {
    id: (t.id as string) ?? null,
    slug: (t.slug as string) ?? null,
    tag: (t.tag as string) ?? null,
    expected_delivery: (t.expected_delivery as string) ?? null,
  };
}

export async function createAfterShipTracking(
  apiKey: string,
  trackingNumber: string,
  slug?: string,
): Promise<AfterShipTracking> {
  const tracking: Record<string, string> = { tracking_number: trackingNumber };
  if (slug) tracking.slug = slug;
  const data = await request(apiKey, "POST", "/trackings", { tracking });
  return parseTracking(data);
}

export async function getAfterShipTracking(
  apiKey: string,
  slug: string,
  trackingNumber: string,
): Promise<AfterShipTracking> {
  const data = await request(apiKey, "GET", `/trackings/${slug}/${trackingNumber}`);
  return parseTracking(data);
}
