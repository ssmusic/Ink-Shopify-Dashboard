// "BUILD YOUR PAGE" IS ANSWERED BY A PAGE.
//
// The dashboard answered it with `logoUrl || heroUrl` — a question about
// pictures. On Corvara Cicli (2026-08-20, the first real Shopify install to
// reach this screen) the two came apart:
//
//   book.tap_page                       present  — the page renders live
//   runtime…logo.primary_logo_candidate ""       — what the kit reads
//   tokens.logo.primary_url             set      — where the logo actually is
//   tap_page.hero_url                   null     — EMPTY BY DESIGN, a non-IG
//     page leaves the hero for the live order's product (tapPageFromEntry)
//   instagram.posts                     0
//
// So a merchant whose page works was told "Your page — not built yet" and
// handed a button to go build one. Behind a storefront password that button is
// a dead end — the exact shape of the 2.1.1 rejection.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const STATUS = readFileSync(
  resolve(process.cwd(), "app/routes/app.api.onboarding.status.tsx"),
  "utf8",
);
const KIT = readFileSync(
  resolve(process.cwd(), "app/services/brand-email.server.ts"),
  "utf8",
);

/** Prose describing a rule is not an instance of it. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/[^\n]*/g, "$1");

describe("brandBuilt", () => {
  it("the kit reports whether a page exists", () => {
    const kit = stripComments(KIT);
    expect(kit, "BrandEmailKit no longer carries hasPage").toMatch(/hasPage\s*:\s*boolean/);
    expect(
      kit,
      "hasPage must be derived from the book's own page, not from imagery",
    ).toMatch(/hasPage\s*:\s*Boolean\(\s*book\?\.tap_page\s*\)/);
  });

  it("the dashboard asks the page question, not the pictures question", () => {
    const status = stripComments(STATUS);
    const assign = status.match(/brandBuilt\s*=\s*Boolean\(([^)]*)\)/);
    expect(assign, "brandBuilt assignment is gone or reshaped").not.toBeNull();
    expect(
      assign![1],
      "brandBuilt still answers 'is your page built?' using only imagery. A live page with no logo and no hero — which is every non-Instagram page, because tapPageFromEntry leaves hero_url empty on purpose — reads as 'not built yet'.",
    ).toMatch(/hasPage/);
  });

  it("imagery alone still counts — a brand mid-build has started", () => {
    // The fix must not INVERT the bug: a logo with no page yet is still
    // progress, and demoting it would be the same error pointing the other way.
    const status = stripComments(STATUS);
    const assign = status.match(/brandBuilt\s*=\s*Boolean\(([^)]*)\)/)![1];
    expect(assign).toMatch(/logoUrl/);
    expect(assign).toMatch(/heroUrl/);
  });

  it("the detector fires on the line that shipped", () => {
    const shipped = "brandBuilt = Boolean(kit.logoUrl || kit.heroUrl);";
    expect(/hasPage/.test(shipped)).toBe(false);
    const fixed = "brandBuilt = Boolean(kit.hasPage || kit.logoUrl || kit.heroUrl);";
    expect(/hasPage/.test(fixed)).toBe(true);
    // a comment naming hasPage is not compliance
    expect(/hasPage/.test(stripComments("// one day, hasPage\nconst x = 1;"))).toBe(false);
  });
});
