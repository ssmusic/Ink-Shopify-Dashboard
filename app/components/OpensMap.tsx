// THE OPENS ON A MAP — the delivery address, the 100 m and 300 m rings, and
// every open that carried a fix, each drawn as a point with a line to the
// address and its distance on the line.
//
// Sam, 2026-09-23: "map — and the distance between the delivery address and
// taps within each order" · "i have the google map api". Google Maps
// JavaScript API, loaded in the browser only (the server render has no
// window): the server draws the frame and the words; the map fills in after
// hydration.
//
// THE KEY IS A BROWSER KEY, never the backend's server key: its own key in
// project inink-c76d3 ("ink-app maps browser"), restricted by HTTP referrer to
// https://install.in.ink/* and the ink-app run.app host, and to the Maps
// JavaScript API alone; it reaches the page as GOOGLE_MAPS_BROWSER_KEY through
// the route's loader. Browser keys are public by design — the restriction is
// what protects it. Without a key, no map is drawn; the words still say it all.
// Google's monthly credit covers this at today's volume; beyond it, Maps
// JavaScript is billed per map load.
//
// The coordinates are for the map alone: nothing here prints one as text.
// Colours are lib/ink-palette.ts's: one blue for every open, neutral otherwise.

import { useEffect, useRef, useState } from "react";
import { INK_DATA, INK_HAIRLINE, INK_MUTED, INK_NEUTRAL } from "../lib/ink-palette";

export type MapPoint = { lat: number; lng: number };
export type MapOpen = MapPoint & {
  /** Metres from the delivery address, as the record measured it. */
  distance_m: number | null;
  /** Shown when the point is hovered, e.g. "Open 2, Aug 20, 11:52 AM". */
  label: string;
};

// The record's rings (ink-backend utils/gps.js: pass ≤ 100 m, near ≤ 300 m).
export const RINGS_M = [100, 300] as const;

export function distanceLabel(m: number | null | undefined): string {
  if (m == null || !Number.isFinite(m)) return "";
  return m >= 1000 ? `${(m / 1000).toFixed(m >= 10_000 ? 0 : 1)} km` : `${Math.round(m)} m`;
}

// One script for the whole page, however many maps open.
let loading: Promise<any> | null = null;
function loadGoogleMaps(apiKey: string): Promise<any> {
  const w = window as any;
  if (w.google?.maps?.Map) return Promise.resolve(w.google.maps);
  if (!loading) {
    loading = new Promise((resolve, reject) => {
      const cb = "__inkMapsReady";
      w[cb] = () => resolve(w.google.maps);
      const s = document.createElement("script");
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(apiKey)}&v=weekly&loading=async&callback=${cb}`;
      s.async = true;
      s.onerror = () => {
        loading = null;
        reject(new Error("Google Maps did not load"));
      };
      document.head.appendChild(s);
    });
  }
  return loading;
}

// The distance label on each line: a small white chip, Polaris-plain.
const LABEL_CSS = `.ink-map-distance{background:#fff;border:1px solid ${INK_HAIRLINE};border-radius:6px;padding:2px 6px;transform:translateY(-2px)}`;

export default function OpensMap({ apiKey, address, opens, height = 280 }: { apiKey: string | null; address: MapPoint; opens: MapOpen[]; height?: number }) {
  const el = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  // Redraw only when what is drawn changes — never on an unrelated re-render.
  const drawn = JSON.stringify({ address, opens });

  useEffect(() => {
    if (!apiKey || !el.current) return;
    let cancelled = false;
    const made: any[] = [];
    (async () => {
      let g: any;
      try {
        g = await loadGoogleMaps(apiKey);
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }
      if (cancelled || !el.current) return;
      const home = { lat: address.lat, lng: address.lng };
      const map = new g.Map(el.current, {
        center: home,
        zoom: 16,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        gestureHandling: "cooperative",
      });
      const bounds = new g.LatLngBounds(home, home);

      for (const r of RINGS_M) {
        const ring = new g.Circle({
          map,
          center: home,
          radius: r,
          strokeColor: INK_MUTED,
          strokeOpacity: r === 100 ? 0.7 : 0.45,
          strokeWeight: 1,
          fillColor: INK_MUTED,
          fillOpacity: r === 100 ? 0.1 : 0.05,
          clickable: false,
        });
        made.push(ring);
        bounds.union(ring.getBounds());
      }

      for (const o of opens) {
        const at = { lat: o.lat, lng: o.lng };
        // A dashed line: Google draws dashes as a repeated symbol on an invisible line.
        made.push(new g.Polyline({
          map,
          path: [at, home],
          strokeOpacity: 0,
          clickable: false,
          icons: [{ icon: { path: "M 0,-1 0,1", strokeOpacity: 1, strokeColor: INK_DATA, scale: 2 }, offset: "0", repeat: "10px" }],
        }));
        made.push(new g.Marker({
          map,
          position: { lat: (o.lat + home.lat) / 2, lng: (o.lng + home.lng) / 2 },
          icon: { path: g.SymbolPath.CIRCLE, scale: 0 },
          label: { text: distanceLabel(o.distance_m), className: "ink-map-distance", color: INK_NEUTRAL, fontSize: "11px", fontWeight: "600" },
          clickable: false,
          zIndex: 5,
        }));
        made.push(new g.Marker({
          map,
          position: at,
          title: o.label,
          icon: { path: g.SymbolPath.CIRCLE, scale: 7, fillColor: INK_DATA, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 },
          zIndex: 10,
        }));
        bounds.extend(at);
      }

      // The address last and on top of every line.
      made.push(new g.Marker({
        map,
        position: home,
        title: "Delivery address", // PLACEHOLDER copy
        icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: INK_NEUTRAL, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 },
        zIndex: 20,
      }));

      map.fitBounds(bounds, 24);
    })();
    return () => {
      cancelled = true;
      for (const m of made) m.setMap?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, apiKey]);

  if (!apiKey || failed) return null;
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
