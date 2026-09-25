// ONE WORD, ONE NUMBER ON THE DASHBOARD (audit 2026-09-25): "Open" and
// "Location shared" each showed two numbers (top counts vs the funnel).
// Made-up counts: this repository is public.
import { describe, expect, it } from "vitest";
import { funnel } from "../lib/delivery-insights";
import { kpisWithSharedCount } from "../components/DeliveryDashboard";

const kpis = { recorded: 10, opened: 4, openRate: 40, locationShared: 1, capped: false };
const delivery = { orders: 10, locationShared: 3 } as never;

describe("the Dashboard's words", () => {
  it("names the funnel's steps by their condition, never the top counts' words", () => {
    const labels = funnel([]).map((s) => s.label);
    expect(labels).toEqual(["Orders", "Delivered", "Delivered and opened", "Delivered, opened and shared"]);
    expect(labels).not.toContain("Open");
    expect(labels).not.toContain("Location shared");
  });
  it("counts Location shared once, from the delivery read, when both reads cover the same orders", () => {
    expect(kpisWithSharedCount(kpis, delivery)?.locationShared).toBe(3);
    expect(kpisWithSharedCount(kpis, { orders: 9, locationShared: 3 } as never)?.locationShared).toBe(1);
    expect(kpisWithSharedCount(kpis, null)).toBe(kpis);
    expect(kpisWithSharedCount(null, delivery)).toBeNull();
  });
});

import { locationWords } from "../lib/record-words";
describe("a distance in the record's words", () => {
  it("prints as the app prints every distance, never raw metres", () => {
    expect(locationWords({ verdict: "shared", distance_m: 1993799 } as never)).toBe("1,994 km from the delivery address");
    expect(locationWords({ verdict: "shared", distance_m: 56.4 } as never)).toBe("56 m from the delivery address");
  });
});

import { VALUE_WORDS } from "../lib/record-words";
describe("the carrier scan's time", () => {
  it("says the tracking was updated, never that it was scanned", () => {
    expect(VALUE_WORDS.last_at).toBe("Tracking updated");
  });
});
