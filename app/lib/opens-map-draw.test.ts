// THE OPENS ON A MAP, as the last open's block and Every open's rows ask it
// (2026-09-24): a far open drawn the short way round, each name on the side
// away from its line, and the delivery address alone as a quiet small map.
import { describe, expect, it } from "vitest";
import { drawOpensMap, nearSide, type OpensMapPalette } from "./opens-map-draw";

type Call = { kind: string; at: unknown; opts: Record<string, unknown>; tooltip?: { text: string; opts: Record<string, unknown> } };

function fakeLeaflet() {
  const calls: Call[] = [];
  const view: { options: Record<string, unknown> | null; mapOptions: Record<string, unknown> | null; prefix: unknown } = { options: null, mapOptions: null, prefix: undefined };
  const layer = (kind: string, at: unknown, opts: Record<string, unknown> = {}) => {
    const c: Call = { kind, at, opts };
    calls.push(c);
    const api = { addTo: () => api, bindTooltip: (text: string, o: Record<string, unknown> = {}) => { c.tooltip = { text, opts: o }; return api; } };
    return api;
  };
  const L = {
    Browser: { mobile: false },
    map: (_el: unknown, o: Record<string, unknown>) => {
      view.mapOptions = o;
      return { attributionControl: { setPrefix: (p: unknown) => { view.prefix = p; } }, fitBounds: (_b: unknown, o2: Record<string, unknown>) => { view.options = o2; }, remove: () => {} };
    },
    tileLayer: (url: string, o: Record<string, unknown>) => layer("tiles", url, o),
    circle: (at: unknown, o: Record<string, unknown>) => layer("circle", at, o),
    polyline: (pts: unknown, o: Record<string, unknown>) => layer("polyline", pts, o),
    circleMarker: (at: unknown, o: Record<string, unknown>) => layer("marker", at, o),
    latLng: (lat: number, lng: number) => ({ lat, lng, toBounds: (size: number) => ({ square: size }) }),
    latLngBounds: () => {
      const parts: unknown[] = [];
      const b = { parts, extend: (x: unknown) => { parts.push(x); return b; }, isValid: () => parts.length > 0 };
      return b;
    },
  };
  return { L: L as unknown as Parameters<typeof drawOpensMap>[0], calls, view };
}

const PALETTE: OpensMapPalette = { address: "#000", rings: ["#000", "#000"], open: "#00f", dash: "6 6", labelClass: "d", nameClass: "n" };
const AUSTIN = { lat: 30.25, lng: -97.75 };
const SHENZHEN = { lat: 22.5, lng: 114.1 };

describe("opens-map-draw", () => {
  it("nearSide: more than half the world away is drawn one world over; near stays put", () => {
    expect(nearSide(SHENZHEN, AUSTIN)).toEqual({ lat: 22.5, lng: 114.1 - 360 });
    expect(nearSide({ lat: 30, lng: -170 }, { lat: 30, lng: 170 })).toEqual({ lat: 30, lng: 190 });
    const near = { lat: 30.2474, lng: -97.7775 };
    expect(nearSide(near, AUSTIN)).toBe(near);
    expect(nearSide(SHENZHEN, null)).toBe(SHENZHEN);
  });

  it("a last open in Shenzhen against a delivery address in Austin: across the Pacific, its name on its left, the address's on its right, the distance on the line", () => {
    const { L, calls, view } = fakeLeaflet();
    drawOpensMap(L, {} as HTMLElement, { address: AUSTIN, addressLabel: "address", opens: [{ ...SHENZHEN, line_label: "13,227 km", label: "last open" }] }, PALETTE);
    const line = calls.find((c) => c.kind === "polyline")!;
    expect(line.at).toEqual([expect.objectContaining({ lng: 114.1 - 360 }), expect.objectContaining(AUSTIN)]);
    expect(line.tooltip?.text).toBe("13,227 km");
    const [open, pin] = calls.filter((c) => c.kind === "marker");
    expect(open.tooltip).toMatchObject({ text: "last open", opts: { direction: "left" } });
    expect(pin.tooltip).toMatchObject({ text: "address", opts: { direction: "right" } });
    expect((view.options?.paddingTopLeft as number[])[0]).toBeGreaterThan(24);
    expect(view.mapOptions).toMatchObject({ zoomControl: true });
  });

  it("the delivery address alone: its pin and rings, no zoom buttons, OpenStreetMap's credit without Leaflet's prefix", () => {
    const { L, calls, view } = fakeLeaflet();
    drawOpensMap(L, {} as HTMLElement, { address: AUSTIN, addressLabel: "address", opens: [] }, PALETTE);
    expect(view.mapOptions).toMatchObject({ zoomControl: false });
    expect(view.prefix).toBe(false);
    expect(calls.filter((c) => c.kind === "circle")).toHaveLength(2);
    expect(calls.filter((c) => c.kind === "polyline")).toHaveLength(0);
    expect(String(calls.find((c) => c.kind === "tiles")?.opts.attribution)).toContain("OpenStreetMap");
  });
});
