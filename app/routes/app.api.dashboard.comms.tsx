import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import { findMerchantDoc } from "../services/merchant-doc.server";

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
// THROUGH THE SAME RESOLVER the Settings panel writes with. This read
// `doc(session.shop)` directly, so on a store holding two merchant docs the
// card reported "off" for toggles the merchant had actually turned on —
// settings/notifications saves through findMerchantDocRef.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const hit = await findMerchantDoc(firestore, session.shop);
    const settings = hit?.data?.notification_settings ?? null;
    return json({ settings });
  } catch (err: any) {
    if (err instanceof Response) throw err;
    console.error("[dashboard/comms] error:", err?.message || err);
    return json({ settings: null });
  }
};
