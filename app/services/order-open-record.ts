// THE ORDER PAGE'S OPEN RECORD — pure projections of what the ink backend
// says about an order's opens, in the merchant's words. No server-only
// import lives here on purpose: the loader shapes the record with it and
// the component words the location with it, and React Router refuses a
// `.server` module in a client export (the production build, not tsc,
// is what says so).
//
// Two doors feed it: the merchant proof read (GET /api/proofs/:id, with the
// merchant's own key — the page asked this door with no key for six months
// and got 401 on every order) and the per-open rows (GET /admin/tap-events,
// asked only for a proof that read already proved is this merchant's).
//
// The words: "opened" is the fact; the verdict is what the customer shared.
// A location that was never shared is said so. A distance that was never
// measured is never "0 m".

import { openLocationOf } from "../lib/open-location";

export type OpenRecord = {
  verification_status: "verified" | "enrolled";
  verification_updated_at: string | null;
  distance_meters: number | null;
  gps_verdict: string | null;
  tap_count: number;
  last_tap_at: string | null;
  photo_urls: string[] | null;
};

export type OpenRow = {
  tap_id: string;
  tap_at: string | null;
  location: string;
  distance_meters: number | null;
  device: string | null;
  coords: { lat: number; lng: number } | null;
  first: boolean;
};

const MEASURED = new Set(["pass", "near", "flagged"]);

function num(v: unknown): number | null {
  if (v == null) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
}

export function formatDistance(m: number | null | undefined): string | null {
  const n = num(m);
  if (n == null) return null;
  if (n < 1000) return `${Math.round(n)} m`;
  if (n < 10_000) return `${(n / 1000).toFixed(1)} km`;
  return `${Math.round(n / 1000).toLocaleString("en-US")} km`;
}

/** The line under "Location" on the order page, or null when there is nothing to say. */
export function locationLine(verdict: string | null | undefined, distanceM: number | null | undefined): string | null {
  const v = String(verdict ?? "").trim().toLowerCase();
  if (!v) return null;
  if (v === "not_shared") return "Not shared by the customer";
  const d = num(distanceM);
  if (v === "unmeasured" || (MEASURED.has(v) && (d == null || d <= 0))) {
    return "Shared — no distance available";
  }
  if (MEASURED.has(v)) return `${formatDistance(d)} from the shipping address`;
  return null;
}

export function openRecordFromProof(p: any): OpenRecord {
  const proof = p && typeof p === "object" ? p : {};
  const tapCount = Math.max(0, Math.trunc(num(proof.tap_count) ?? 0));
  // THE ORDER'S OWN WORD (ink-backend #132): the door's reading of the first
  // open — its word and its own distance — so the Location line never pairs
  // the proof's word with a distance another open measured. A door before
  // #132 carries no reading, and the two stamps are read as they were.
  const own = openLocationOf(proof.open_location);
  const firstDistance = own ? own.distance_m : num(proof.first_tap_distance_to_shipping_m);
  const media = Array.isArray(proof.media_items) ? proof.media_items : null;
  const photoUrls = media
    ? media.map((m: any) => (m && (m.url || m.media_url)) || null).filter(Boolean)
    : null;
  return {
    // "verified" is this page's existing internal token for "the customer
    // opened it" (it renders as Active). It follows the opens, not the verdict.
    verification_status: tapCount > 0 ? "verified" : "enrolled",
    verification_updated_at: typeof proof.first_tap_at === "string" ? proof.first_tap_at : null,
    distance_meters: firstDistance != null && firstDistance > 0 ? Math.round(firstDistance) : null,
    gps_verdict: own ? own.verdict : proof.gps_verdict != null && String(proof.gps_verdict).trim() ? String(proof.gps_verdict) : null,
    tap_count: tapCount,
    last_tap_at: typeof proof.last_tap_at === "string" ? proof.last_tap_at : null,
    photo_urls: photoUrls && photoUrls.length ? photoUrls : null,
  };
}

function deviceWord(ua: unknown): string | null {
  const s = typeof ua === "string" ? ua : "";
  if (!s.trim()) return null;
  if (/iPhone/.test(s)) return "iPhone";
  if (/iPad/.test(s)) return "iPad";
  if (/Android/.test(s)) return "Android";
  if (/Macintosh/.test(s)) return "Mac";
  if (/Windows/.test(s)) return "Windows";
  if (/Linux/.test(s)) return "Linux";
  return "Browser";
}

/** Every open of the order, newest first, each saying what it shared. */
export function openRowsFromTapEvents(rows: any[] | null | undefined): OpenRow[] {
  const list = Array.isArray(rows) ? rows.filter((r) => r && typeof r === "object") : [];
  const sorted = [...list].sort((a, b) => Date.parse(b.tap_at || 0) - Date.parse(a.tap_at || 0));
  return sorted.map((r, i) => {
    const shared = r.location_source === "gps";
    const d = num(r.distance_to_shipping_m);
    const lat = num(r.tap_lat);
    const lng = num(r.tap_lng);
    const location = !shared
      ? "Location not shared"
      : d != null && d > 0
        ? `${formatDistance(d)} from the shipping address`
        : "Shared — no distance available";
    return {
      tap_id: String(r.tap_id || ""),
      tap_at: typeof r.tap_at === "string" ? r.tap_at : null,
      location,
      distance_meters: d != null && d > 0 ? Math.round(d) : null,
      device: deviceWord(r.device_info),
      coords: shared && lat != null && lng != null ? { lat, lng } : null,
      first: i === sorted.length - 1,
    };
  });
}
