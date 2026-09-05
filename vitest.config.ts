// Vitest for the embed. This repo shipped with NO test runner at all — its
// only gates were typecheck, build and lint, none of which can tell whether
// the Shopify outbox actually rewrites a tracking link. See
// app/services/branded-tracking-link.canary.test.ts for why that mattered.
//
// Deliberately NOT wired through vite.config.ts: that config exists to serve
// the Shopify app (HMR hosts, tunnel URLs, the react-router plugin) and
// loading it under test drags the whole app pipeline in. Tests here are pure
// server-module tests, so they get a plain node environment and nothing else.
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    // `extensions/**` is here because the order status block is the one piece
    // of buyer-facing code in this repo that neither typecheck nor build ever
    // sees: it is plain JS, outside tsconfig's `include`, bundled by the
    // Shopify CLI at `shopify app deploy` and by nothing else. Its guard
    // decides what address a buyer taps out of a shipping email, so it gets
    // real tests instead of the string-scraping pins it had.
    include: [
      "app/**/*.{test,canary.test}.{ts,tsx}",
      "extensions/**/src/*.test.{js,ts}",
    ],
  },
});
