// ONE ADMIN API VERSION, AND A SUPPORTED ONE. Shopify serves 2025-10 until
// 2026-10-16 15:00 UTC and then answers those requests as 2026-01, whatever
// changed. Every call the app makes names 2026-07 (served until 2027-07-16),
// the library's and every hand-written fetch alike. All 79 operations were
// validated against Admin 2026-07 (and the one Storefront query against
// Storefront 2026-07) on 2026-09-26.
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const APP = new URL("..", import.meta.url).pathname;
const files = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) return files(p);
    return /\.(ts|tsx)$/.test(name) && !/\.test\./.test(name) ? [p] : [];
  });

describe("the Admin API version", () => {
  it("the library speaks 2026-07", () => {
    const src = readFileSync(join(APP, "shopify.server.ts"), "utf8");
    expect(src.match(/ApiVersion\.\w+/g)).toEqual(["ApiVersion.July26", "ApiVersion.July26"]);
  });

  it("every hand-written GraphQL URL names 2026-07", () => {
    const urls = files(APP).flatMap((f) =>
      [...readFileSync(f, "utf8").matchAll(/\/api\/(\d{4}-\d{2}|unstable)\/graphql\.json/g)].map((m) => `${f}: ${m[1]}`),
    );
    expect(urls.length).toBeGreaterThan(10);
    expect(urls.filter((u) => !u.endsWith(": 2026-07"))).toEqual([]);
  });
});
