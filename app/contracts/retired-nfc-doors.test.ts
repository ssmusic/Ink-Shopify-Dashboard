// THE NFC LANE'S RETIRED DOORS ARE CLOSED (2026-09-25). Four routes took
// requests from anyone and acted with a store's Shopify session; nothing had
// called them in 30+ days (Cloud Run logs). With FEATURE_NFC off each loader
// and action returns 404 as its first statement. The code stays (tabled,
// never deleted — CLAUDE.md law 7).
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { FEATURE_NFC } from "../flags";
import { retiredDoor } from "../services/retired-door.server";

const DOORS: Array<[string, string[]]> = [
  ["api.enroll.tsx", ["loader", "action"]],
  ["api.verify.tsx", ["loader", "action"]],
  ["api.retrieve.$proofId.tsx", ["loader", "action"]],
  ["webhooks.nfs.verify.tsx", ["action"]],
  ["api.photos.upload.tsx", ["loader", "action"]],
];

describe("the retired NFC doors", () => {
  it("stay closed while the NFC lane is tabled", () => {
    expect(FEATURE_NFC).toBe(false);
    expect(retiredDoor().status).toBe(404);
  });
  it.each(DOORS)("%s returns the retired door before any work", (file, fns) => {
    const src = readFileSync(new URL(`../routes/${file}`, import.meta.url), "utf8");
    for (const fn of fns) {
      const start = src.search(new RegExp(`export const ${fn} = async \\(`));
      expect(start, `${file} ${fn}`).toBeGreaterThan(-1);
      const body = src.slice(start, start + 600);
      const firstCode = body.split("\n").slice(1).find((l) => l.trim() && !l.trim().startsWith("//"));
      expect(firstCode?.trim(), `${file} ${fn}`).toBe("if (!FEATURE_NFC) return retiredDoor();");
    }
  });
});
