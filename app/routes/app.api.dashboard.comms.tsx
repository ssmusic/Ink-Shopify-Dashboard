import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";

const json = (data: any, init?: ResponseInit) =>
  new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json" },
    ...init,
  });

// GET /app/api/dashboard/comms — the merchant's real notification toggles for
// the dashboard Communications card (session-authed, mirrors tap-stats).
// Reads the same merchants/{shop}.notification_settings the Settings panel
// writes — never invented numbers, just the actual on/off state.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  try {
    const { session } = await authenticate.admin(request);
    const doc = await firestore.collection("merchants").doc(session.shop).get();
    const settings = doc.exists ? (doc.data()?.notification_settings ?? null) : null;
    return json({ settings });
  } catch (err: any) {
    if (err instanceof Response) throw err;
    console.error("[dashboard/comms] error:", err?.message || err);
    return json({ settings: null });
  }
};
