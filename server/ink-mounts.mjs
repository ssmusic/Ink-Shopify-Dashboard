// WHAT INK MOUNTS — the route contract between the two apps, in one list.
//
// The Ritualist and ink are one build (React Router compiles every file under
// app/routes into the manifest, and `gcloud run deploy --source` cannot vary a
// build per service), so the difference between the two apps is decided when
// the server STARTS, not when it is built: server/build.mjs re-exports the
// generated build with every route not named here removed — from the server's
// route table AND from the client manifest — so under APP_FLAVOR=ink the
// Ritualist's screens and doors do not exist. Not hidden, not redirected:
// unmatched, the way a route that was never written is unmatched.
//
// Plain ESM with no imports on purpose: node loads it at start with nothing
// but the build on disk, and vitest loads it to pin the contract
// (app/contracts/ink-mounts.test.ts — every route file must be classified).
//
// Route ids are React Router's flat-route ids: `routes/<file without
// extension>`, a folder route by its folder (`routes/app._index`), plus `root`.

/** Shared by both apps: the shell, auth, the layout, the enrol and tracking
 *  webhooks, and the three GDPR doors. */
export const SHARED_MOUNTS = Object.freeze([
  "root",
  "routes/_index",
  "routes/auth.$",
  "routes/auth.login",
  "routes/app",
  "routes/app._index",
  "routes/webhooks.orders_create",
  "routes/webhooks.orders_fulfilled",
  "routes/webhooks.fulfillments_create",
  "routes/webhooks.fulfillments_update",
  "routes/webhooks.app.uninstalled",
  "routes/webhooks.app.scopes_update",
  "routes/webhooks.customers.data_request",
  "routes/webhooks.customers.redact",
  "routes/webhooks.shop.redact",
  // THE RECORD'S DOOR — both flavors: the charge, Shopify's return, the
  // outcome (routes/app.record.tsx). The in.ink screen and the Ritualist's
  // order page both draw it.
  "routes/app.record",
]);

/** ink's own screens — mounted under ink only. */
export const INK_ONLY_MOUNTS = Object.freeze([
  "routes/app.ink._index",
  "routes/app.ink.$section",
  "routes/app.ink.settings",
]);

/** Everything ink mounts. Every other route id in the build is the
 *  Ritualist's and is absent under ink. */
export const INK_MOUNTS = Object.freeze([...SHARED_MOUNTS, ...INK_ONLY_MOUNTS]);

const INK_MOUNT_SET = new Set(INK_MOUNTS);

export function mountsUnderInk(routeId) {
  return INK_MOUNT_SET.has(routeId);
}

/** The build's route table (or the client manifest's `routes`) with every
 *  route ink does not mount removed. A child whose parent is not mounted is
 *  removed too — React Router cannot place an orphan, and the list above is
 *  written so that never happens; this is the guard, not the rule. */
export function inkRouteManifest(manifest) {
  const kept = {};
  for (const [id, route] of Object.entries(manifest ?? {})) {
    if (!mountsUnderInk(id)) continue;
    if (route?.parentId && !mountsUnderInk(route.parentId)) continue;
    kept[id] = route;
  }
  return kept;
}

const INK_ONLY_SET = new Set(INK_ONLY_MOUNTS);

/** The same table for the Ritualist: everything the build holds EXCEPT ink's
 *  own screens. The Ritualist gains nothing from ink existing — a merchant
 *  of the paid app who types /app/ink finds what was there before this
 *  build: nothing. Every route that existed before ink is kept, by the same
 *  object reference. */
export function ritualistRouteManifest(manifest) {
  const kept = {};
  for (const [id, route] of Object.entries(manifest ?? {})) {
    if (INK_ONLY_SET.has(id)) continue;
    if (route?.parentId && INK_ONLY_SET.has(route.parentId)) continue;
    kept[id] = route;
  }
  return kept;
}
