// ONE CODEBASE, TWO APPS — the flavor is the env var, nothing else.
//
// The Ritualist (client 8da1…, service `shopify-app`) and ink (client 45cc…,
// service `ink-app`) run the SAME image. Each Cloud Run service carries its
// own record's SHOPIFY_API_KEY / SHOPIFY_API_SECRET / SHOPIFY_APP_URL, and
// `APP_FLAVOR` says which app this process is. Unset means the Ritualist,
// so every service that exists today keeps behaving exactly as it did —
// the ink flavor is additive, never a default.
//
// What the flavor decides (each site names this file):
//   · the routes the server mounts (server/build.mjs — ink mounts only its own)
//   · the Shopify session collection (two apps on one store must not share
//     `offline_{shop}`, and they would — the id carries no app identity)
//   · what an install provisions (plan `ink`, the mark captured off the
//     storefront, no carrier service — ink holds no write_shipping)
//   · what the webhooks may SELECT: ink holds ~10 scopes, not 20, and
//     Shopify fails a whole query over one unauthorized field (order #1019)
//   · whether the embed's own buyer emails exist (ink sends none)
//
// Read at call time, not module load, so a test can stub the env.

export type AppFlavor = "ritualist" | "ink";

/** The flavor this process runs as. Anything but the exact word `ink` is
 *  the Ritualist — a typo must never quietly unmount the live app. */
export function appFlavor(): AppFlavor {
  return process.env.APP_FLAVOR === "ink" ? "ink" : "ritualist";
}

export function isInk(): boolean {
  return appFlavor() === "ink";
}
