// INK'S NUMBERS — the Insights KPIs, inside the app.
//
// Sam, 2026-09-23: "i want to import kpi from insights and really make this
// app great". The dashboard's own "Since your first order" block (the-ritualist
// src/pages/Dashboard.tsx + src/lib/dashboard-lines.ts) reads one backend
// door, and so does this: GET /api/merchant-insights (ink-backend
// routes/api/merchantInsights.js) with the MERCHANT'S OWN api key
// (`Authorization: Bearer <ink_api_key>`) — the key decides the shop; the
// admin secret never scopes a merchant read. All time,
// over the merchant's 2,000 most recent records (`capped` says when more
// exist). Fail-soft and bounded: no numbers is a screen without the row,
// never a slow or broken screen.
//
// Not imported, on purpose: click-through and the campaign numbers (the
// Ritualist's page and campaigns — ink has neither) and the returns numbers.

const INK_API_URL = process.env.INK_API_URL || "https://us-central1-inink-c76d3.cloudfunctions.net/api";
const READ_BUDGET_MS = 6_000; // five side-by-side reads can meet cold backend instances (measured 2026-09-23: a 0.4 s read timed out at 3 s)

export type InkKpis = {
  /** Orders with a record. */
  recorded: number;
  /** Orders whose tracking link was opened at least once. */
  opened: number;
  openRatePct: number;
  /** Records whose open carries the buyer's location. */
  locationShared: number;
  /** Records whose payload is signed. */
  signedPct: number;
  /** Records whose delivery outcome reads DISPUTED. */
  disputed: number;
  /** More records exist than the 2,000 counted. */
  capped: boolean;
};

const num = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) ? v : 0);

export function kpisFromBody(body: unknown): InkKpis | null {
  const b = body as {
    capped?: unknown;
    throughput?: { enrollments?: unknown; opened?: unknown; open_rate_pct?: unknown };
    integrity?: { payload_integrity_pct?: unknown; geofence?: { gps_count?: unknown }; outcomes?: { DISPUTED?: unknown } };
  } | null;
  if (!b || typeof b !== "object" || !b.throughput) return null;
  return {
    recorded: num(b.throughput.enrollments),
    opened: num(b.throughput.opened),
    openRatePct: num(b.throughput.open_rate_pct),
    locationShared: num(b.integrity?.geofence?.gps_count),
    signedPct: num(b.integrity?.payload_integrity_pct),
    disputed: num(b.integrity?.outcomes?.DISPUTED),
    capped: b.capped === true,
  };
}

export async function readInkKpis(apiKey: string | null | undefined, fetchImpl: typeof fetch = fetch): Promise<InkKpis | null> {
  if (!apiKey) return null;
  const base = INK_API_URL.endsWith("/") ? INK_API_URL.slice(0, -1) : INK_API_URL;
  try {
    const res = await fetchImpl(`${base}/merchant-insights`, {
      headers: { Authorization: `Bearer ${apiKey}` },
      signal: AbortSignal.timeout(READ_BUDGET_MS),
    });
    if (!res.ok) return null;
    return kpisFromBody(await res.json());
  } catch (err) {
    console.warn("[ink] insights read failed:", (err as Error)?.message ?? err);
    return null;
  }
}
