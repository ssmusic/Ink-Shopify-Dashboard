import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { handleInkPrivacy } from "../services/ink-privacy.server";

// BOTH APPS, ONE PATH (2026-09-25, Sam: "what we did for ink needs to be done
// for the ritualist"). The request is persisted before Shopify is answered;
// a backend that fails answers 503 so Shopify retries (never 200 for work not
// done); a data request is answered from Settings with the customer's file.
// Which app's sessions and records are touched is decided by the flavor inside
// services/ink-privacy.server.ts and firestore-session-storage.server.ts.
export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, payload } = await authenticate.webhook(request);
  return handleInkPrivacy("data_request", shop, payload);
};
