import { merchantRead } from "./ink-reader.server";
// INK'S NUMBERS — the Insights KPIs, inside the app.
//
// Sam, 2026-09-23: "i want to import kpi from insights and really make this
// app great". The dashboard's own "Since your first order" block (the-ritualist
// src/pages/Dashboard.tsx + src/lib/dashboard-lines.ts) reads one backend
// door, and so does this: GET /api/merchant-insights (ink-backend
// routes/api/merchantInsights.js) with the MERCHANT'S OWN api key
// (`Authorization: Bearer <ink_api_key>`) — the key decides the shop; the
// admin secret never scopes a merchant read. The backend caps the sample at
// 2,000 records; its index fallback does not guarantee recency. Failed reads
// remain unavailable, and never turn into zero counts.
//
// Not imported, on purpose: click-through and the campaign numbers (the
// Ritualist's page and campaigns — ink has neither) and the returns numbers.

export type InkKpis = {
  /** Orders with a record. */
  recorded: number;
  /** Orders whose tracking link was opened at least once. */
  opened: number;
  /** Records whose open carries the buyer's location. */
  locationShared: number;
  /** More records exist than the 2,000 counted. */
  capped: boolean;
};

const num = (v: unknown): number =>
  typeof v === "number" && Number.isFinite(v) ? v : 0;

export function kpisFromBody(body: unknown): InkKpis | null {
  const b = body as {
    capped?: unknown;
    throughput?: {
      enrollments?: unknown;
      opened?: unknown;
    };
    integrity?: {
      geofence?: { gps_count?: unknown };
    };
  } | null;
  if (!b || typeof b !== "object" || !b.throughput) return null;
  if (
    ![
      b.throughput.enrollments,
      b.throughput.opened,
      b.integrity?.geofence?.gps_count,
    ].every((v) => typeof v === "number" && Number.isInteger(v) && v >= 0)
  )
    return null;
  return {
    recorded: num(b.throughput.enrollments),
    opened: num(b.throughput.opened),
    locationShared: num(b.integrity?.geofence?.gps_count),
    capped: b.capped === true,
  };
}

export async function readInkKpis(
  apiKey: string | null | undefined,
  fetchImpl: typeof fetch = fetch,
): Promise<InkKpis | null> {
  return kpisFromBody(
    await merchantRead(apiKey, "merchant-insights", fetchImpl),
  );
}
