// WHO MAY SUBMIT AN ACTION — the hosts the two apps' own pages are served from.
//
// Since 7.12 React Router refuses a UI route's action (every fetcher, every
// <Form>) with 400 "Bad Request" unless the browser's `Origin` is the
// request's own origin or its host is listed here. Behind Cloud Run the two
// never match: TLS ends before the container, so `react-router-serve` builds
// the request as `http://…` while the page is `https://…` — and ink's requests
// reach the container through the Worker, addressed to the run.app host. With
// no list, every action in both apps answered 400; in ink, clicking an order
// showed "Application Error" (2026-09-24 — #154 moved the router from 7.9.3
// to 7.18.4).
//
// One host per app: its toml's `application_url`, pinned by
// app/contracts/action-origins.test.ts. Resource routes (webhooks, /api/*)
// are not checked by the router and need nothing here.

import type { Config } from "@react-router/dev/config";

const APP_HOSTS = [
  "app.in.ink", // The Ritualist — shopify.app.toml
  "install.in.ink", // ink. — shopify.app.ink.toml
];

/**
 * `shopify app dev` serves the app from a tunnel it names at start and hands
 * the dev server that URL as SHOPIFY_APP_URL. The production image builds with
 * it empty (the Dockerfile's build arg is never passed), so it adds nothing
 * there.
 */
function devTunnelHost(): string[] {
  const url = process.env.SHOPIFY_APP_URL;
  if (!url) return [];
  try {
    return [new URL(url).host];
  } catch {
    return [];
  }
}

export default {
  allowedActionOrigins: [...new Set([...APP_HOSTS, ...devTunnelHost()])],
} satisfies Config;
