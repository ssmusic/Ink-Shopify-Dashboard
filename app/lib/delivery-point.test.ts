// WHICH FACT THE DELIVERY POINT IS (2026-09-24, Sam on the Alo demo's #TOWELS:
// "also is this a problem"). An order with no shipping address and an order
// whose address has no map point yet said one sentence; they are two facts —
// in the record page's words (the-ritualist src/lib/delivery-point.ts).

import { describe, expect, it } from "vitest";
import { NO_MAP_POINT_YET, NO_SHIPPING_ADDRESS, addressStateOf, addressStateWord, noPointSentence } from "./delivery-point";

const saying = (word: unknown) => ({ summary: { address_state: word as never } });

describe("addressStateOf", () => {
  it("reads the backend's word when the row has no point", () => {
    expect(addressStateOf(saying("none"), null)).toBe("none");
    expect(addressStateOf(saying("ungeocoded"), null)).toBe("ungeocoded");
  });
  it("a point on the row is a point, whatever the word", () => {
    expect(addressStateOf(saying("none"), { lat: 34.05, lng: -118.24 })).toBe("geocoded");
    expect(addressStateOf(null, { lat: 34.05, lng: -118.24 })).toBe("geocoded");
  });
  it("a record without the word, or with one it does not know, says nothing new", () => {
    expect(addressStateOf(saying(undefined), null)).toBeNull();
    expect(addressStateOf(saying("geocoded"), null)).toBeNull();
    expect(addressStateOf(saying("pass"), null)).toBeNull();
    expect(addressStateOf(null, null)).toBeNull();
  });
});

describe("addressStateWord", () => {
  it("keeps only the three words", () => {
    expect(addressStateWord("none")).toBe("none");
    expect(addressStateWord("ungeocoded")).toBe("ungeocoded");
    expect(addressStateWord("geocoded")).toBe("geocoded");
    expect(addressStateWord("12 Main St")).toBeNull();
    expect(addressStateWord(3)).toBeNull();
  });
});

describe("noPointSentence", () => {
  it("says the two facts apart, in the record page's words", () => {
    expect(noPointSentence("none")).toBe("No shipping address on this order.");
    expect(noPointSentence("ungeocoded")).toBe("The address is on file but has no map point yet.");
    expect(NO_SHIPPING_ADDRESS).not.toBe(NO_MAP_POINT_YET);
  });
  it("says nothing when there is a point, or when the record does not say", () => {
    expect(noPointSentence("geocoded")).toBeNull();
    expect(noPointSentence(null)).toBeNull();
  });
});
