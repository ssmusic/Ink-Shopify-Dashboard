// THE CHECKOUT BESIDE THE OPENS, IN TWO LINES — the vectors file is the
// record page's (the-ritualist src/lib/checkout-words.vectors.json), byte for
// byte, so the app and the page never say one record two ways.

import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { checkoutFromBody, checkoutLines } from "./checkout-words";

const vectors = JSON.parse(readFileSync(new URL("./checkout-words.vectors.json", import.meta.url), "utf8")) as {
  cases: { name: string; cvo: unknown; lines: { label: string; words: string }[] }[];
};
const at = (iso: string) => `<${iso}>`;

describe("checkoutLines", () => {
  for (const c of vectors.cases) {
    it(c.name, () => {
      const cvo = checkoutFromBody(c.cvo);
      expect(cvo).not.toBeNull();
      expect(checkoutLines(cvo!, { when: at })).toEqual(c.lines);
    });
  }

  it("no verdict word is ever said — counts and facts", () => {
    const all = vectors.cases.flatMap((c) => checkoutLines(checkoutFromBody(c.cvo)!, { when: at }).map((l) => `${l.label} ${l.words}`)).join(" ").toLowerCase();
    for (const word of ["fraud", "suspicious", "mismatch", "risk", "flag", "fail", "pass", "alert", "warning"]) {
      expect(all.includes(word), word).toBe(false);
    }
  });
});

describe("checkoutFromBody", () => {
  it("is nothing when the door said nothing — the switch is off, or an older backend", () => {
    for (const v of [undefined, null, "x", 3, [], {}, { recorded: "yes" }]) expect(checkoutFromBody(v)).toBeNull();
  });

  it("an old order is one fact", () => {
    expect(checkoutFromBody({ recorded: false })).toEqual({ recorded: false });
  });

  it("a recorded checkout without its opens block is read as nothing — never half a line", () => {
    expect(checkoutFromBody({ recorded: true, checkout: { device: "iPhone" } })).toBeNull();
  });
});
