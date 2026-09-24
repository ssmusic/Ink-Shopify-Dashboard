// THE OPENS ON A MAP — the delivery address and every open that carried a
// fix, each drawn as a point with a line to the address and its distance on
// the line. Ink has no default range and does not judge a distance (Sam,
// 2026-09-23: "we dont judge" · "we dont have a default range"): the only
// rings are the scale guides below, drawn when asked, named by their radius.
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
//
// ONE OPEN, PICKED OUT (Sam, 2026-09-23, of the record's opens: "can each one
// of these have a map if you click on it also?"). Pressing an open in the list
// under the map sets `focus`: that open keeps its label and comes forward, the
// others dim and drop their distance labels; no focus draws every open alike.
// The marks are restyled in place; the map never redraws, pans or zooms for it.
//
// THE GUIDE RINGS (Sam, 2026-09-23, of the record page's open section: "so
// amazing" — then "we dont judge delivery"). With `rings`, the address carries
// its 100 m and 300 m rings as scale guides: dashed, in the palette's neutral
// grey, named only by their radius, and the same for every open — no colour,
// dash or word says inside or outside. The view then holds every open and the
// smallest ring that holds them all (both rings, with no open), as the record
// page's map does. With no address, the open is drawn alone: no ring, no line.

import { useEffect, useRef, useState } from "react";
import { INK_DATA, INK_HAIRLINE, INK_MUTED, INK_NEUTRAL } from "../lib/ink-palette";
import { GUIDE_RINGS_M, metresBetween } from "../lib/every-open";

export type MapPoint = { lat: number; lng: number };
export type MapOpen = MapPoint & {
  /** Metres from the delivery address, as the record measured it. */
  distance_m: number | null;
  /** Shown when the point is hovered, e.g. "Open 2, Aug 20, 11:52 AM". */
  label: string;
};

/** How open `i` is drawn while `focus` is picked out (null: none is). */
export const DIM = 0.25;
export function focusLook(i: number, focus: number | null | undefined): { opacity: number; label: boolean; z: number } {
  if (focus == null) return { opacity: 1, label: true, z: 10 };
  return i === focus ? { opacity: 1, label: true, z: 15 } : { opacity: DIM, label: false, z: 5 };
}

// A dashed line: Google draws dashes as a repeated symbol on an invisible line.
function dashes(opacity: number, color: string = INK_DATA) {
  return [{ icon: { path: "M 0,-1 0,1", strokeOpacity: opacity, strokeColor: color, scale: 2 }, offset: "0", repeat: "10px" }];
}

// A point `metres` from `from` along `bearing` (radians, clockwise from north).
function offset(from: MapPoint, metres: number, bearing: number): MapPoint {
  const dLat = (metres * Math.cos(bearing)) / 111_320;
  const dLng = (metres * Math.sin(bearing)) / (111_320 * Math.max(0.2, Math.cos((from.lat * Math.PI) / 180)));
  return { lat: from.lat + dLat, lng: from.lng + dLng };
}

// A ring as a closed path, so it can be dashed like the lines.
function ringPath(center: MapPoint, metres: number): MapPoint[] {
  const steps = 72;
  return Array.from({ length: steps + 1 }, (_, i) => offset(center, metres, (i / steps) * 2 * Math.PI));
}

/** The ring the view holds: the smallest that holds every open, or the outer one with none. */
export function viewRing(address: MapPoint, opens: MapPoint[]): number {
  const outer = GUIDE_RINGS_M[GUIDE_RINGS_M.length - 1];
  if (!opens.length) return outer;
  const reach = Math.max(0, ...opens.map((o) => metresBetween(address, o)));
  return GUIDE_RINGS_M.find((r) => reach <= r) ?? outer;
}

// The handles each open leaves on the map: only what picking one out restyles.
type Drawn = {
  line: { setOptions(o: object): void };
  label: { setVisible(v: boolean): void; setZIndex(z: number): void };
  point: { setOpacity(o: number): void; setZIndex(z: number): void };
};

function applyFocus(drawn: Drawn[], focus: number | null | undefined) {
  drawn.forEach((d, i) => {
    const look = focusLook(i, focus);
    d.line.setOptions({ icons: dashes(look.opacity), zIndex: look.z });
    d.label.setVisible(look.label);
    d.label.setZIndex(look.z + 1);
    d.point.setOpacity(look.opacity);
    d.point.setZIndex(look.z + 2);
  });
}

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

// The distance label on each line: a small white chip, Polaris-plain. A
// ring's radius: the same chip in the guides' grey, at the top of its ring,
// so it reads over any street name.
const LABEL_CSS =
  `.ink-map-distance{background:#fff;border:1px solid ${INK_HAIRLINE};border-radius:6px;padding:2px 6px;transform:translateY(-2px)}` +
  `.ink-map-ring{background:#fff;border:1px solid ${INK_HAIRLINE};border-radius:6px;padding:0 5px;line-height:16px}`;

export default function OpensMap({
  apiKey,
  address,
  opens,
  focus = null,
  height = 280,
  rings = false,
}: {
  apiKey: string | null;
  /** The delivery address; null draws the opens alone, with no ring and no line. */
  address: MapPoint | null;
  opens: MapOpen[];
  /** The open to pick out, by index into `opens`; null: none. */
  focus?: number | null;
  height?: number;
  /** Draw the 100 m and 300 m scale guides around the address. */
  rings?: boolean;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const drawnRef = useRef<Drawn[]>([]);
  const focusRef = useRef(focus);
  focusRef.current = focus;
  // Redraw only when what is drawn changes — never on an unrelated re-render.
  const drawn = JSON.stringify({ address, opens, rings });

  useEffect(() => {
    if (!apiKey || !el.current) return;
    let cancelled = false;
    const made: any[] = [];
    drawnRef.current = [];
    (async () => {
      let g: any;
      try {
        g = await loadGoogleMaps(apiKey);
      } catch {
        if (!cancelled) setFailed(true);
        return;
      }
      if (cancelled || !el.current) return;
      const home = address ? { lat: address.lat, lng: address.lng } : null;
      const center = home ?? (opens[0] ? { lat: opens[0].lat, lng: opens[0].lng } : null);
      if (!center) return;
      const map = new g.Map(el.current, {
        center,
        zoom: 16,
        disableDefaultUI: true,
        zoomControl: true,
        clickableIcons: false,
        gestureHandling: "cooperative",
      });
      const bounds = new g.LatLngBounds(center, center);
      // Room around the address: the ring the view holds, or (with no rings)
      // about 150 m each way, so an open on the doorstep does not zoom the map
      // to the pavement.
      const room = (metres: number) => {
        for (const bearing of [0, Math.PI / 2, Math.PI, (3 * Math.PI) / 2]) bounds.extend(offset(center, metres, bearing));
      };
      if (home && rings) {
        // The radii are named only when the rings are drawn at a scale that
        // can carry them: an open beyond the outer ring zooms the view out
        // until the rings are small marks, and their names would pile up.
        const named = opens.every((o) => metresBetween(home, o) <= GUIDE_RINGS_M[GUIDE_RINGS_M.length - 1]);
        GUIDE_RINGS_M.forEach((r, i) => {
          made.push(
            new g.Circle({ map, center: home, radius: r, strokeOpacity: 0, fillColor: INK_MUTED, fillOpacity: i === 0 ? 0.08 : 0.04, clickable: false, zIndex: 1 }),
            new g.Polyline({ map, path: ringPath(home, r), strokeOpacity: 0, clickable: false, icons: dashes(0.9, INK_MUTED), zIndex: 2 }),
          );
          // Its radius, and nothing else — a guide, never a verdict.
          if (named)
            made.push(
              new g.Marker({
                map,
                position: offset(home, r, 0),
                icon: { path: g.SymbolPath.CIRCLE, scale: 0 },
                label: { text: `${r} m`, className: "ink-map-ring", color: INK_MUTED, fontSize: "10px", fontWeight: "500" },
                clickable: false,
                zIndex: 3,
              }),
            );
        });
        room(viewRing(home, opens));
      } else if (home) {
        room(150);
      }

      for (const o of opens) {
        const at = { lat: o.lat, lng: o.lng };
        // With no address there is nothing to measure against: the point alone.
        const line = new g.Polyline({
          map: home ? map : null,
          path: home ? [at, home] : [at],
          strokeOpacity: 0,
          clickable: false,
          icons: dashes(1),
        });
        const label = new g.Marker({
          map: home ? map : null,
          position: home ? { lat: (o.lat + home.lat) / 2, lng: (o.lng + home.lng) / 2 } : at,
          icon: { path: g.SymbolPath.CIRCLE, scale: 0 },
          label: { text: distanceLabel(o.distance_m), className: "ink-map-distance", color: INK_NEUTRAL, fontSize: "11px", fontWeight: "600" },
          clickable: false,
          zIndex: 5,
        });
        const point = new g.Marker({
          map,
          position: at,
          title: o.label,
          icon: { path: g.SymbolPath.CIRCLE, scale: 7, fillColor: INK_DATA, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 2 },
          zIndex: 10,
        });
        made.push(line, label, point);
        drawnRef.current.push({ line, label, point });
        bounds.extend(at);
      }
      if (!home) room(150);

      // The address last and on top of every line.
      if (home)
        made.push(new g.Marker({
          map,
          position: home,
          title: "Delivery address", // PLACEHOLDER copy
          icon: { path: g.SymbolPath.CIRCLE, scale: 8, fillColor: INK_NEUTRAL, fillOpacity: 1, strokeColor: "#ffffff", strokeWeight: 3 },
          zIndex: 20,
        }));

      map.fitBounds(bounds, 24);
      // An open picked out before the map finished loading.
      applyFocus(drawnRef.current, focusRef.current);
    })();
    return () => {
      cancelled = true;
      drawnRef.current = [];
      for (const m of made) m.setMap?.(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn, apiKey]);

  // Picking an open out restyles what is drawn; it never redraws the map.
  useEffect(() => {
    applyFocus(drawnRef.current, focus);
  }, [focus]);

  if (!apiKey || failed) return null;
  return (
    <>
      <style>{LABEL_CSS}</style>
      <div
        ref={el}
        data-testid="opens-map"
        data-points={opens.length}
        data-focus={focus ?? ""}
        data-rings={rings && address ? GUIDE_RINGS_M.join(",") : ""}
        role="img"
        aria-label={
          !address
            ? `Map: ${opens.length} ${opens.length === 1 ? "open" : "opens"} with a location`
            : opens.length
              ? `Map: the delivery address and ${opens.length} ${opens.length === 1 ? "open" : "opens"} with a location`
              : "Map: the delivery address"
        }
        style={{ height, width: "100%", borderRadius: "8px", overflow: "hidden", border: "1px solid var(--p-color-border)", background: "#f1f1f1" }}
      />
    </>
  );
}
