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
    // Shopify's React provider imports react-router itself. Left external,
    // Node hands it a different copy of react-router than the app's, and its
    // useNavigate throws outside that copy's router. Inlined, both share one,
    // so a contract can render the real layout (app/contracts/ink-no-stray-dollar.test.tsx).
    server: { deps: { inline: [/@shopify\/shopify-app-react-router/] } },
  },
});
