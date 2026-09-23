// THE OPENS ON A MAP — the delivery address, the 100 m and 300 m rings, and
// every open that carried a fix, each drawn as a point with a line to the
// address and its distance on the line.
//
// Sam, 2026-09-23: "map — and the distance between the delivery address and
// taps within each order". Ported from the console's Interaction Timeline
// (inkadmin), in Shopify's light look.
//
// Leaflet with OpenStreetMap's standard tiles, loaded in the browser only
// (Leaflet touches `window` at import, and the server render has none): the
// server draws the frame and the words; the map fills in after hydration.
// OSM's tile policy asks for attribution (drawn by Leaflet's control) and
// light use — a paid tile provider before real volume is Sam's call.
//
// The coordinates are for the map alone: nothing here prints one as text.
// The words beside the map say the distance and the verdict.

import { useEffect, useRef } from "react";

export type MapPoint = { lat: number; lng: number };
export type MapOpen = MapPoint & {
  /** Metres from the delivery address, as the record measured it. */
  distance_m: number | null;
  verdict: string | null;
  /** Shown in the point's tooltip, e.g. "Open 2 · Aug 20, 11:52 AM". */
  label: string;
};

const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
const ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

// The record's rings (ink-backend utils/gps.js: pass ≤ 100 m, near ≤ 300 m).
export const RINGS_M = [100, 300] as const;

export const VERDICT_COLOR: Record<string, string> = {
  pass: "#29845a", // Polaris success
  near: "#b98900", // Polaris caution
  flagged: "#c70a24", // Polaris critical
  imprecise: "#616161",
  unmeasured: "#616161",
};

export function distanceLabel(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "";
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}

// The distance label on each line: a small white chip, Polaris-plain.
const LABEL_CSS = `.ink-map-distance{background:#fff;border:1px solid #d4d4d4;border-radius:6px;box-shadow:none;color:#303030;font:600 11px/1.2 Inter,system-ui,sans-serif;padding:2px 6px}.ink-map-distance:before{display:none}`;

export default function OpensMap({ address, opens, height = 280 }: { address: MapPoint; opens: MapOpen[]; height?: number }) {
  const el = useRef<HTMLDivElement | null>(null);
  // Redraw only when what is drawn changes — never on an unrelated re-render.
  const drawn = JSON.stringify({ address, opens });

  useEffect(() => {
    let map: import("leaflet").Map | null = null;
    let cancelled = false;
    (async () => {
      const L = (await import("leaflet")).default;
      if (cancelled || !el.current) return;
      map = L.map(el.current, { zoomControl: true, attributionControl: true, scrollWheelZoom: false });
      L.tileLayer(TILE_URL, { maxZoom: 19, attribution: ATTRIBUTION }).addTo(map);

      const home = L.latLng(address.lat, address.lng);
      const bounds = L.latLngBounds([home, home]);
      for (const r of RINGS_M) {
        L.circle(home, {
          radius: r,
          color: r === 100 ? "#29845a" : "#b98900",
          weight: 1,
          dashArray: "4 4",
          fillOpacity: r === 100 ? 0.08 : 0.04,
        }).addTo(map);
        // A circle's own getBounds needs the map's view set first; the square
        // around the address that holds the ring does not.
        bounds.extend(home.toBounds(r * 2));
      }

      for (const o of opens) {
        const at = L.latLng(o.lat, o.lng);
        const color = VERDICT_COLOR[o.verdict ?? ""] ?? "#616161";
        L.polyline([at, home], { color, weight: 2, dashArray: "6 6", opacity: 0.9 })
          .bindTooltip(distanceLabel(o.distance_m), { permanent: true, direction: "center", className: "ink-map-distance" })
          .addTo(map);
        L.circleMarker(at, { radius: 7, color: "#ffffff", weight: 2, fillColor: color, fillOpacity: 1 })
          .bindTooltip(o.label, { direction: "top" })
          .addTo(map);
        bounds.extend(at);
      }

      // The address last, so its pin sits on top of every line.
      L.circleMarker(home, { radius: 8, color: "#ffffff", weight: 3, fillColor: "#303030", fillOpacity: 1 })
        .bindTooltip("Delivery address", { direction: "top" }) // PLACEHOLDER copy
        .addTo(map);

      map.fitBounds(bounds, { padding: [24, 24], maxZoom: 17 });
    })();
    return () => {
      cancelled = true;
      map?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn]);

  return (
    <>
      <style>{LABEL_CSS}</style>
      <div
      ref={el}
      data-testid="opens-map"
      data-points={opens.length}
      role="img"
      aria-label={`Map: the delivery address and ${opens.length} ${opens.length === 1 ? "open" : "opens"} with a location`}
      style={{ height, width: "100%", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--p-color-border)", background: "#f1f1f1" }}
      />
    </>
  );
}
