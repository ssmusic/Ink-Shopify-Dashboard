// THE OPENS ON A MAP, THE RECORD PAGE'S WAY — how an order's opens are drawn
// against the delivery address in Every open's rows.
//
// Sam, 2026-09-24: "the shopify app was supposed to have the good maps i showed
// you" — the record page's own maps (the-ritualist src/lib/opens-map-draw.ts,
// #1396, drawn in one colour as its no-judging pass #1401 draws them), ported
// here:
//   - OpenStreetMap's standard tiles, with their attribution (the surface
//     greys them);
//   - the delivery address's 100 m and 300 m rings, as scale guides: nothing
//     on the map says near or far (Sam, 2026-09-23: "we dont judge
//     delivery"; "we dont have a default range");
//   - each open that carries a fix as a ring (white inside, one colour
//     around), so it never reads as a second address;
//   - a line from each open to the address, in that one colour and one dash
//     for every open, with the distance ON the line as a label;
//   - the address pin drawn LAST, so it sits on top of every line;
//   - both points named on the map ("address", "open 3"), not on hover;
//   - the view holding every point and the smallest ring that holds them all
//     (an open 55 m away is seen at the 100 m ring's scale, never lost in the
//     300 m one), with room on the right for the names.
// No address: the points alone — no ring, no line, no distance. A phone
// scrolls past the map: one finger never pans it.
//
// The caller brings Leaflet (it touches `window` at import, so it loads in
// the browser only) and the palette. The coordinates are for the map alone:
// nothing here prints one as text.

import type * as Leaflet from "leaflet";
import { GUIDE_RINGS_M, metresBetween } from "./every-open";

export type OpensMapPoint = { lat: number; lng: number };

export type OpensMapOpen = OpensMapPoint & {
  /** The distance as the surface words it ("56 m", "2.6 km"); null: the line carries none. */
  line_label: string | null;
  /** The point's name on the map, e.g. "open 3". */
  label: string;
};

export type OpensMapScene = {
  address: OpensMapPoint | null;
  /** The address pin's name on the map. */
  addressLabel: string;
  opens: OpensMapOpen[];
};

export type OpensMapPalette = {
  address: string;
  /** The 100 m ring's colour, then the 300 m ring's. */
  rings: readonly [string, string];
  /** Every open's ring and its line: one colour, whatever the distance. */
  open: string;
  /** The line's dash, the same for every open; none draws it solid. */
  dash?: string;
  /** The CSS classes the surface styles the distance label and the names with. */
  labelClass: string;
  nameClass: string;
};

export type OpensMapHandle = { remove(): void };

export const TILE_URL = "https://tile.openstreetmap.org/{z}/{x}/{y}.png";
export const TILE_ATTRIBUTION = '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noreferrer">OpenStreetMap</a> contributors';

/** The ring the view holds: the smallest that holds every open (the outer one past it). */
export function viewRingOf(address: OpensMapPoint, opens: OpensMapPoint[]): number {
  const reach = Math.max(0, ...opens.map((o) => metresBetween(address, o)));
  return GUIDE_RINGS_M.find((r) => reach <= r) ?? GUIDE_RINGS_M[GUIDE_RINGS_M.length - 1];
}

export function drawOpensMap(L: typeof Leaflet, el: HTMLElement, scene: OpensMapScene, palette: OpensMapPalette): OpensMapHandle {
  const map = L.map(el, { zoomControl: true, attributionControl: true, scrollWheelZoom: false, dragging: !L.Browser.mobile });
  L.tileLayer(TILE_URL, { maxZoom: 19, attribution: TILE_ATTRIBUTION }).addTo(map);
  const name: Leaflet.TooltipOptions = { permanent: true, direction: "right", offset: [10, 0], className: palette.nameClass };

  const bounds = L.latLngBounds([]);
  const address = scene.address;
  const home = address ? L.latLng(address.lat, address.lng) : null;
  if (home && address) {
    GUIDE_RINGS_M.forEach((r, i) => {
      L.circle(home, { radius: r, color: palette.rings[i], weight: 1, dashArray: "4 4", fillOpacity: i === 0 ? 0.08 : 0.04 }).addTo(map);
    });
    // A circle's own getBounds needs the map's view set first; the square
    // around the address that holds the ring does not.
    bounds.extend(home.toBounds(viewRingOf(address, scene.opens) * 2));
  }

  for (const o of scene.opens) {
    const at = L.latLng(o.lat, o.lng);
    bounds.extend(at);
    if (home) {
      const line = L.polyline([at, home], { color: palette.open, weight: 2, dashArray: palette.dash, opacity: 0.9 });
      if (o.line_label) line.bindTooltip(o.line_label, { permanent: true, direction: "center", className: palette.labelClass });
      line.addTo(map);
    }
    L.circleMarker(at, { radius: 7, color: palette.open, weight: 3, fillColor: "#ffffff", fillOpacity: 1, opacity: 1 })
      .bindTooltip(o.label, name)
      .addTo(map);
  }

  // The address last, so its pin sits on top of every line.
  if (home) {
    L.circleMarker(home, { radius: 8, color: "#ffffff", weight: 3, fillColor: palette.address, fillOpacity: 1 })
      .bindTooltip(scene.addressLabel, name)
      .addTo(map);
  }

  // The names stand to the right of their points: the view leaves them room.
  const longest = Math.max(scene.addressLabel.length, ...scene.opens.map((o) => o.label.length));
  if (bounds.isValid()) map.fitBounds(bounds, { paddingTopLeft: [24, 24], paddingBottomRight: [34 + Math.ceil(longest * 6.5), 24], maxZoom: 17 });
  return { remove: () => map.remove() };
}
