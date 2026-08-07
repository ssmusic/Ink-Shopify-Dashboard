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
    include: ["app/**/*.{test,canary.test}.{ts,tsx}"],
  },
});
