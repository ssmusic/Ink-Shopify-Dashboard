// THE BROWSERS (2026-09-23) — the same line the record page prints
// (the-ritualist src/lib/audit-packet.ts browsersLine), pinned by the same
// fixtures (the-ritualist src/lib/audit-packet.browsers.test.ts).
import { describe, expect, it } from "vitest";
import { browsersLine, type RecordBrowser, type RecordBrowsers } from "./record-words";

const browser = (label: string, device: string | null, opens: number, after: boolean | null): RecordBrowser => ({
  label, device, opens, first_open_at: "2026-09-12T09:00:00.000Z", last_open_at: "2026-09-20T07:00:00.000Z", first_seen_after_delivered_scan: after,
});
const of = (list: RecordBrowser[], unknown = 0): RecordBrowsers => ({ count: list.length, unknown_opens: unknown, list });

describe("browsersLine — PLACEHOLDER copy", () => {
  it("how many, each one's device and opens, the opens no id came with, and the ones first seen after the delivered scan", () => {
    expect(browsersLine(of([browser("A", "iPhone", 4, false), browser("B", "Mac", 1, false), browser("C", "iPhone", 1, true)], 1)))
      .toBe("Opened from 3 browsers: iPhone ×4, Mac ×1, iPhone ×1, browser unknown ×1. The third was first seen after the carrier's delivered scan.");
  });

  it("several after the scan; all of them; the only one", () => {
    expect(browsersLine(of([browser("A", "iPhone", 18, false), browser("B", "Mac", 6, true), browser("C", "iPhone", 2, true)])))
      .toBe("Opened from 3 browsers: iPhone ×18, Mac ×6, iPhone ×2. The second and third were first seen after the carrier's delivered scan.");
    expect(browsersLine(of([browser("A", "iPhone", 2, true), browser("B", "Android", 1, true)])))
      .toBe("Opened from 2 browsers: iPhone ×2, Android ×1. All 2 were first seen after the carrier's delivered scan.");
    expect(browsersLine(of([browser("A", "iPhone", 3, true)])))
      .toBe("Opened from 1 browser: iPhone ×3. It was first seen after the carrier's delivered scan.");
  });

  it("none after the scan, or no scan yet: the count alone; a browser whose device is not known is 'a browser'", () => {
    expect(browsersLine(of([browser("A", "iPhone", 18, false), browser("B", "Mac", 6, null)]))).toBe("Opened from 2 browsers: iPhone ×18, Mac ×6.");
    expect(browsersLine(of([browser("A", null, 2, null)]))).toBe("Opened from 1 browser: a browser ×2.");
  });

  it("no browser counted — every open before the id, or none — says nothing", () => {
    expect(browsersLine(of([], 20))).toBeNull();
    expect(browsersLine(null)).toBeNull();
    expect(browsersLine(undefined)).toBeNull();
  });
});
