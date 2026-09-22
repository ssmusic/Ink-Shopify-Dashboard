// THE SERVER BUILD, PER FLAVOR — what `react-router-serve` is handed.
//
// `react-router-serve <path>` imports the module at <path> and treats its
// named exports as the build (`routes`, `assets`, `entry`, `publicPath`,
// `assetsBuildDirectory`, …); this file is that module. It re-exports the
// generated build untouched and, ONLY when APP_FLAVOR=ink, replaces the two
// exports that say which routes exist:
//
//   · `routes`        — the server's route table: what a request can match,
//                       whose loaders and actions can run;
//   · `assets.routes` — the client manifest: what the browser's router knows,
//                       what `/__manifest` will hand it on discovery.
//
// Both filtered by the same list (server/ink-mounts.mjs), so under ink the
// Ritualist's screens and doors are not reachable by document request, by
// client navigation, by `.data` fetch or by lazy route discovery. With the
// env unset the Ritualist keeps every route it had before ink existed (the
// same route objects, by reference) and gains none of ink's two screens —
// it serves exactly what it served before this file existed.
//
// Why here and not in app/routes.ts: that file runs at BUILD time, and the
// two services build from one source (`gcloud run deploy --source .`, no
// build args). The flavor is a runtime fact, so the mounting is too.

import * as full from "../build/server/index.js";
import { inkRouteManifest, ritualistRouteManifest } from "./ink-mounts.mjs";

export * from "../build/server/index.js";

const ink = process.env.APP_FLAVOR === "ink";
const mount = ink ? inkRouteManifest : ritualistRouteManifest;

export const routes = mount(full.routes);

export const assets = { ...full.assets, routes: mount(full.assets.routes) };

if (ink) {
  const kept = Object.keys(routes).length;
  const all = Object.keys(full.routes).length;
  console.log(`[ink] APP_FLAVOR=ink — mounting ${kept} of ${all} routes; the Ritualist's ${all - kept} are absent.`);
}
