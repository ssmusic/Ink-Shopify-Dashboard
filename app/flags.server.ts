// Server-only flags (read process.env — never import from client components).

// DEV/ops-only routes: carrier-service debug, manual webhook re-register,
// one-off order tagging. Off in production so a reviewer's direct-URL probe
// can't reach internal tooling; set ENABLE_DEV_ROUTES=true for ops work.
export const ENABLE_DEV_ROUTES = process.env.ENABLE_DEV_ROUTES === "true";

// Throws a 404 Response when dev routes are disabled — call at the top of a
// dev-only loader/action.
export function assertDevRoutesEnabled(): void {
  if (!ENABLE_DEV_ROUTES) {
    throw new Response("Not found", { status: 404 });
  }
}
