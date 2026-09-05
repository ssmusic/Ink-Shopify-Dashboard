import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import { findMerchantDocRef } from "../services/merchant-doc.server";

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

// GET /app/api/dashboard/comms — the merchant's real notification toggles for
// the dashboard Communications card (session-authed, mirrors tap-stats).
// Reads the same merchants/{shop}.notification_settings the Settings panel
// writes — never invented numbers, just the actual on/off state.
//
// findMerchantDocRef, not a doc-id-only read: the Settings panel WRITES
// notification_settings through the shared resolver (app.api.settings.
// notifications.tsx), which can land on a different doc than session.shop's
// own id on a store holding two merchant docs. A doc-id-only read here would
// silently show "no settings configured" on exactly the store where the
// Settings tab shows them on (§17.2 landmine).
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const hit = await findMerchantDocRef(firestore, session.shop);
    const settings = hit?.data?.notification_settings ?? null;
    return json({ settings });
  } catch (err: any) {
    if (err instanceof Response) throw err;
    console.error("[dashboard/comms] error:", err?.message || err);
    return json({ settings: null });
  }
};
