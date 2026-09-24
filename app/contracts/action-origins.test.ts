// AN ACTION FROM THE APP'S OWN PAGE RUNS, CHECKED MECHANICALLY.
//
// React Router refuses an action whose `Origin` is neither the request's own
// origin nor a host listed in react-router.config.ts. Behind Cloud Run the
// container sees `http://…` for an `https://…` page, so an App URL missing
// from the list fails every fetcher and form in that app with 400 — and no
// gate caught it, because nothing here posted an action through the router
// (2026-09-24: "Application Error" on clicking an order in ink).
//
//   1. Each app's App URL (its toml's application_url) is on the list.
//   2. Through the router's own request handler, an action posted the way
//      Cloud Run hands it over runs for each app, and without the list the
//      same post is refused — as is a stranger's, with it.

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createRequestHandler, type ServerBuild } from "react-router";
import { describe, expect, it } from "vitest";
import config from "../../react-router.config";

const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
const appHost = (toml: string) => {
  const url = read(toml).match(/^application_url\s*=\s*"([^"]+)"/m)?.[1];
  if (!url) throw new Error(`${toml} names no application_url`);
  return new URL(url).host;
};

// What reaches each container: the Ritualist's domain maps straight onto its
// service; ink's Worker forwards install.in.ink to the run.app host.
const APPS = [
  { toml: "shopify.app.toml", reaches: (host: string) => host },
  { toml: "shopify.app.ink.toml", reaches: () => "ink-app-250065525755.us-central1.run.app" },
].map(({ toml, reaches }) => {
  const host = appHost(toml);
  return { toml, origin: `https://${host}`, host, containerHost: reaches(host) };
});

/** The smallest server build the router will run: one UI route with an action. */
function buildWith(allowedActionOrigins: string[] | undefined): ServerBuild {
  return {
    entry: { module: { default: () => new Response(null, { status: 204 }) } },
    routes: {
      root: { id: "root", path: "", module: { default: () => null } },
      "routes/app": {
        id: "routes/app",
        parentId: "root",
        path: "app",
        module: { default: () => null, action: async () => ({ ran: "the action" }) },
      },
    },
    assets: { version: "test", url: "/manifest.js", entry: { module: "/entry.js", imports: [] }, routes: {} },
    publicPath: "/",
    assetsBuildDirectory: "build/client",
    basename: "/",
    future: {},
    ssr: true,
    isSpaMode: false,
    prerender: [],
    routeDiscovery: { mode: "lazy", manifestPath: "/__manifest" },
    allowedActionOrigins,
  } as unknown as ServerBuild;
}

/** A fetcher's submission, as Cloud Run hands it to the container: plain http. */
const post = (origin: string, containerHost: string) =>
  new Request(`http://${containerHost}/app.data`, {
    method: "POST",
    headers: { Origin: origin, "Content-Type": "application/x-www-form-urlencoded" },
    body: "intent=inspect",
  });

describe("who may submit an action", () => {
  it("lists every app's own App URL host", () => {
    for (const app of APPS) expect(config.allowedActionOrigins, app.toml).toContain(app.host);
  });

  it("runs an action posted from each app's own page", async () => {
    const handle = createRequestHandler(buildWith(config.allowedActionOrigins), "test");
    for (const app of APPS) {
      const res = await handle(post(app.origin, app.containerHost));
      expect(res.status, app.toml).toBe(200);
      expect(await res.text(), app.toml).toContain("the action");
    }
  });

  it("refuses the same post without the list (the 2026-09-24 break), and a stranger's with it", async () => {
    const bare = createRequestHandler(buildWith(undefined), "test");
    for (const app of APPS) expect((await bare(post(app.origin, app.containerHost))).status, app.toml).toBe(400);

    const handle = createRequestHandler(buildWith(config.allowedActionOrigins), "test");
    expect((await handle(post("https://in.ink.example.com", "app.in.ink"))).status).toBe(400);
    expect((await handle(post("https://evil.in.ink", "install.in.ink"))).status).toBe(400);
  });
});
