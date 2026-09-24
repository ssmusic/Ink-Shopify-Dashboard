import { describe, expect, it } from "vitest";
import { VALUE_WORDS, valueWords } from "./record-words";

// The Delivery place's two places (ink-backend #149/#150/#153): the same
// labels and words as the-ritualist, in either shape the backend serves.
describe("the two places on the Delivery place element", () => {
  it("have the Ritualist's labels and print as words, never [object Object]", () => {
    expect(VALUE_WORDS.ship_to).toBe("Ship-to");
    expect(VALUE_WORDS.carrier_delivered_place).toBe("Carrier's delivered scan");
    expect(valueWords("ship_to", "Dallas, TX, United States")).toBe("Dallas, TX, United States");
    expect(valueWords("carrier_delivered_place", { city: "Los Angeles", state: "CA", country: "United States", scanned_at: "2026-09-01T20:52:00Z" })).toBe("Los Angeles, CA, United States");
  });
});
