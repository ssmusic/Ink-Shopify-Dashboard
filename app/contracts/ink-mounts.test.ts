// WHICH ROUTES EACH APP MOUNTS — pinned against the files on disk.
//
// ink and the Ritualist are one build; the difference is decided when the
// server starts (server/build.mjs filters the route table by
// server/ink-mounts.mjs under APP_FLAVOR=ink). Three things can go wrong
// silently, and each is a test here:
//   1. a route file appears that nobody classified — it would mount under ink
//      by accident (if listed) or vanish from it (if not) with no review;
//   2. the list names a route that no longer exists — a screen ink expects
//      that never renders;
//   3. the Ritualist's mounting changes at all — with the env unset the
//      filter must not be applied, and the build's own objects must be what
//      react-router-serve is handed.
//
// Lives in app/contracts, not app/routes: React Router compiles every file
// under app/routes as a route module (route-contracts.test.ts learned this
// the hard way).

import { readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";
import { INK_MOUNTS, INK_ONLY_MOUNTS, SHARED_MOUNTS, inkRouteManifest, mountsUnderInk, ritualistRouteManifest } from "../../server/ink-mounts.mjs";

const ROUTES_DIR = resolve(process.cwd(), "app/routes");

/** Every route id the build will contain, derived the way @react-router/fs-routes
 *  derives them: `routes/<file sans extension>`, a folder route by its folder. */
function routeIdsOnDisk(): string[] {
  const ids: string[] = ["root"];
  for (const entry of readdirSync(ROUTES_DIR, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      const files = readdirSync(join(ROUTES_DIR, entry.name));
      if (files.some((f) => /^route\.tsx?$/.test(f))) ids.push(`routes/${entry.name}`);
    } else if (/\.tsx?$/.test(entry.name) && !/\.test\.tsx?$/.test(entry.name)) {
      ids.push(`routes/${entry.name.replace(/\.tsx?$/, "")}`);
    }
  }
  return ids.sort();
}

/** THE RITUALIST'S OWN — every route that must NOT exist under ink. A new
 *  route file has to be added to exactly one of the three lists (this one,
 *  SHARED_MOUNTS, INK_ONLY_MOUNTS) or the first test fails. */
const RITUALIST_ONLY = [
  "routes/api.debug-carrier",
  "routes/api.enroll",
  "routes/api.jobs.notifications",
  "routes/api.orders.fetch",
  "routes/api.photos.upload",
  "routes/api.retrieve.$proofId",
  "routes/api.return-status",
  "routes/api.shipping-rates",
  "routes/api.verify",
  "routes/app.api.auth.login",
  "routes/app.api.dashboard.comms",
  "routes/app.api.dashboard.insights",
  "routes/app.api.dashboard.inventory",
  "routes/app.api.dashboard.metrics",
  "routes/app.api.dashboard.recent-activity",
  "routes/app.api.dashboard.tap-stats",
  "routes/app.api.onboarding.status",
  "routes/app.api.orders",
  "routes/app.api.orders.$orderId.record-export",
  "routes/app.api.settings.branded-tracking-link",
  "routes/app.api.settings.delivery-mode",
  "routes/app.api.settings.inventory",
  "routes/app.api.settings.media",
  "routes/app.api.settings.notifications",
  "routes/app.api.users",
  "routes/app.api.warehouse.enroll",
  "routes/app.api.warehouse.inventory",
  "routes/app.api.warehouse.upload",
  "routes/app.billing",
  "routes/app.dashboard",
  "routes/app.debug",
  "routes/app.help",
  "routes/app.orders.$orderId",
  "routes/app.payment",
  "routes/app.payment.callback",
  "routes/app.register-webhook",
  "routes/app.reorder-tags",
  "routes/app.settings",
  "routes/app.tag-existing-orders",
  "routes/app.tagged-shipments",
  "routes/app.tagged-shipments.$orderId",
  "routes/app.tagged-shipments._index",
  "routes/ink.update",
  "routes/webhooks.fulfillments",
  "routes/webhooks.nfs.verify",
  "routes/webhooks.app.subscriptions_update",
].sort();

describe("the route contract between the two apps", () => {
  it("classifies every route file on disk exactly once", () => {
    const onDisk = routeIdsOnDisk();
    const classified = [...SHARED_MOUNTS, ...INK_ONLY_MOUNTS, ...RITUALIST_ONLY].sort();
    expect(
      classified,
      "A route file exists that is not classified (or a classified route is gone). Decide: shared, ink-only, or the Ritualist's — server/ink-mounts.mjs or this file's RITUALIST_ONLY.",
    ).toEqual(onDisk);

    const seen = new Set<string>();
    for (const id of classified) {
      expect(seen.has(id), `${id} is classified twice`).toBe(false);
      seen.add(id);
    }
  });

  it("ink mounts exactly its own routes: the shell, auth, the layout, the enrol and tracking webhooks, GDPR, its screens (home, its sections, Settings), and the record's door", () => {
    expect([...INK_MOUNTS].sort()).toEqual(
      [
        "root",
        "routes/_index",
        "routes/auth.$",
        "routes/auth.login",
        "routes/app",
        "routes/app._index",
        "routes/app.ink._index",
        "routes/app.ink.$section",
        "routes/app.ink.settings",
        "routes/webhooks.orders_create",
        "routes/webhooks.orders_fulfilled",
        "routes/webhooks.fulfillments_create",
        "routes/webhooks.fulfillments_update",
        "routes/webhooks.app.uninstalled",
        "routes/webhooks.app.scopes_update",
        "routes/webhooks.customers.data_request",
        "routes/webhooks.customers.redact",
        "routes/webhooks.shop.redact",
        "routes/api.jobs.privacy",
        "routes/app.record",
      ].sort(),
    );
  });

  it("mounts none of the Ritualist's screens or doors under ink", () => {
    for (const id of RITUALIST_ONLY) {
      expect(mountsUnderInk(id), `${id} must not exist under ink`).toBe(false);
    }
    // The names a reviewer would try first.
    for (const id of ["routes/app.billing", "routes/app.dashboard", "routes/app.settings", "routes/app.api.settings.notifications", "routes/app.orders.$orderId", "routes/app.api.onboarding.status"]) {
      expect(mountsUnderInk(id)).toBe(false);
    }
  });

  it("filters a manifest to ink's routes and never leaves an orphan", () => {
    const manifest = {
      root: { id: "root", parentId: undefined },
      "routes/app": { id: "routes/app", parentId: "root", path: "app" },
      "routes/app.ink._index": { id: "routes/app.ink._index", parentId: "routes/app", path: "ink", index: true },
      "routes/app.billing": { id: "routes/app.billing", parentId: "routes/app", path: "billing" },
      "routes/app.tagged-shipments": { id: "routes/app.tagged-shipments", parentId: "routes/app", path: "tagged-shipments" },
      "routes/app.tagged-shipments._index": { id: "routes/app.tagged-shipments._index", parentId: "routes/app.tagged-shipments", index: true },
      // A child that claims an ink parent but is not itself listed: gone.
      "routes/app.made-up": { id: "routes/app.made-up", parentId: "routes/app", path: "made-up" },
      // A listed id under an unlisted parent would be an orphan: gone too.
      "routes/webhooks.shop.redact": { id: "routes/webhooks.shop.redact", parentId: "routes/app.billing", path: "x" },
    };
    expect(Object.keys(inkRouteManifest(manifest)).sort()).toEqual(["root", "routes/app", "routes/app.ink._index"]);
    // The kept entries are the same objects, not copies.
    expect((inkRouteManifest(manifest) as Record<string, unknown>)["routes/app"]).toBe(manifest["routes/app"]);
  });

  it("the Ritualist keeps every route it had and gains none of ink's screens", () => {
    const manifest = {
      root: { id: "root", parentId: undefined },
      "routes/app": { id: "routes/app", parentId: "root", path: "app" },
      "routes/app.ink._index": { id: "routes/app.ink._index", parentId: "routes/app", path: "ink", index: true },
      "routes/app.ink.settings": { id: "routes/app.ink.settings", parentId: "routes/app", path: "ink/settings" },
      "routes/app.billing": { id: "routes/app.billing", parentId: "routes/app", path: "billing" },
      "routes/webhooks.nfs.verify": { id: "routes/webhooks.nfs.verify", parentId: "root", path: "webhooks/nfs/verify" },
    };
    const kept = ritualistRouteManifest(manifest) as Record<string, unknown>;
    expect(Object.keys(kept).sort()).toEqual(["root", "routes/app", "routes/app.billing", "routes/webhooks.nfs.verify"]);
    for (const id of Object.keys(kept)) expect(kept[id]).toBe((manifest as Record<string, unknown>)[id]);
  });

  it("every route that existed before ink is kept for the Ritualist, by id", () => {
    const before = [...SHARED_MOUNTS, ...RITUALIST_ONLY];
    const manifest = Object.fromEntries([...before, ...INK_ONLY_MOUNTS].map((id) => [id, { id }]));
    expect(Object.keys(ritualistRouteManifest(manifest)).sort()).toEqual([...before].sort());
  });
});

describe("the server build each flavor is handed", () => {
  const buildSrc = readFileSync(resolve(process.cwd(), "server/build.mjs"), "utf8");
  const pkg = JSON.parse(readFileSync(resolve(process.cwd(), "package.json"), "utf8"));

  it("is served through server/build.mjs, which re-exports the generated build", () => {
    expect(pkg.scripts.start).toBe("react-router-serve ./server/build.mjs");
    expect(buildSrc).toContain('export * from "../build/server/index.js"');
  });

  it("picks the ink table only under the exact word `ink`, and the Ritualist's otherwise", () => {
    expect(buildSrc).toContain('const ink = process.env.APP_FLAVOR === "ink";');
    expect(buildSrc).toContain("const mount = ink ? inkRouteManifest : ritualistRouteManifest;");
    expect(buildSrc).toContain("export const routes = mount(full.routes);");
    expect(buildSrc).toContain("export const assets = { ...full.assets, routes: mount(full.assets.routes) };");
  });
});
