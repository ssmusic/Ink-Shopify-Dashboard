// ONE OPEN ON A MAP, THE RECORD PAGE'S WAY — a row of Every open, opened.
//
// Sam, 2026-09-24: "the shopify app was supposed to have the good maps i showed
// you" — the record page's own map (the-ritualist src/components/OpenMap.tsx):
// OpenStreetMap's tiles in grey, the delivery address a solid pin drawn last,
// its 100 m and 300 m rings as scale guides, THIS open as a ring, the line
// between them with the distance on it, both named on the map ("address",
// "open 3"), and the view fitted to the smallest ring that holds the open
// (lib/opens-map-draw.ts). The open and its line are the app's one blue
// (lib/ink-palette.ts), the same for every open whatever its distance; the
// address and the rings are ink. No key to hold: nothing reaches Google.
//
// Leaflet touches `window` at import, so it and its stylesheet load in the
// browser, with the first opened row, never with the page and never on the
// server. The CSS below carries no quote: React's server render escapes one
// inside <style> and the rule dies.

import { useEffect, useRef, useState } from "react";
import { drawOpensMap, type OpensMapHandle, type OpensMapOpen, type OpensMapPalette, type OpensMapPoint } from "../lib/opens-map-draw";
import { INK_DATA } from "../lib/ink-palette";

const INK = "#000000";

const PALETTE: OpensMapPalette = {
  address: INK,
  rings: [INK, INK],
  open: INK_DATA,
  // One dash for every open — the look Sam pointed at, never a verdict.
  dash: "6 6",
  labelClass: "ink-open-map-distance",
  nameClass: "ink-open-map-name",
};

// Scoped to the map: grey tiles so the marks read; the distance as a pill and
// the names as captions, in Polaris's mono face; the attribution stays, as
// OpenStreetMap asks.
const CSS =
  ".ink-open-map .leaflet-tile-pane{filter:grayscale(1)}" +
  // Leaflet lays its tiles with plus-lighter against a Chrome hairline bug; in
  // a filtered pane that addition itself draws a light seam between tiles.
  ".ink-open-map img.leaflet-tile{mix-blend-mode:normal}" +
  ".ink-open-map .leaflet-container{font-family:inherit}" +
  ".ink-open-map .leaflet-control-attribution a{color:inherit}" +
  ".ink-open-map .leaflet-attribution-flag{display:none !important}" +
  ".ink-open-map-distance{background:#fff;border:1px solid #000;border-radius:9px;box-shadow:none;color:#000;font:500 10px/1.2 var(--p-font-family-mono);padding:2px 7px}" +
  ".ink-open-map-name{background:transparent;border:0;box-shadow:none;color:#000;font:500 10px/1.2 var(--p-font-family-mono);padding:0;text-shadow:0 0 2px #fff,0 0 2px #fff,0 0 4px #fff}" +
  ".ink-open-map-distance:before,.ink-open-map-name:before{display:none}";

export default function OpenMap({
  address,
  open,
  addressLabel = "address",
  height = 260,
}: {
  address: OpensMapPoint | null;
  /** The open to draw against the address; null draws the address alone
   *  (the last open's small delivery-address map, 2026-09-24). */
  open: OpensMapOpen | null;
  /** The address pin's name on the map. */
  addressLabel?: string;
  height?: number;
}) {
  const el = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  // Redraw only when what is drawn changes, never on an unrelated render.
  const drawn = JSON.stringify({ address, open, addressLabel });

  useEffect(() => {
    let handle: OpensMapHandle | null = null;
    let cancelled = false;
    (async () => {
      try {
        const [leaflet] = await Promise.all([import("leaflet"), import("leaflet/dist/leaflet.css")]);
        if (cancelled || !el.current) return;
        // Leaflet ships as a CommonJS bundle: the bundler hands it over as the default.
        const L = (leaflet as unknown as { default?: typeof leaflet }).default ?? leaflet;
        handle = drawOpensMap(L, el.current, { address, addressLabel, opens: open ? [open] : [] }, PALETTE);
      } catch {
        if (!cancelled) setFailed(true);
      }
    })();
    return () => {
      cancelled = true;
      handle?.remove();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [drawn]);

  return (
    // `isolation` keeps Leaflet's own stacking (panes 400, controls 1000)
    // inside the map, under Shopify's and Polaris's layers.
    <div className="ink-open-map" style={{ position: "relative", isolation: "isolate" }}>
      <style>{CSS}</style>
      <div
        ref={el}
        data-testid="open-map"
        data-points={open ? 1 : 0}
        data-address={address ? "pinned" : "absent"}
        role="group"
        aria-label={open ? (address ? `Map: ${open.label} and the delivery address` : `Map: ${open.label}`) : "Map: the delivery address"}
        style={{ height, width: "100%", borderRadius: "var(--p-border-radius-200)", overflow: "hidden", border: "1px solid var(--p-color-border)", background: "#f1f1f1" }}
      />
      {failed ? <p style={{ margin: "8px 0 0", font: "inherit", color: "var(--p-color-text-secondary)" }}>The map did not load.</p> : null}
    </div>
  );
}
