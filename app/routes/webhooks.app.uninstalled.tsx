import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import { SESSION_COLLECTION } from "../firestore-session-storage.server";
import { isInk } from "../services/app-flavor.server";
import { restoreInkPlanOnRitualistUninstall } from "../services/plan-precedence.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  //
  // ONLY THIS APP'S OWN SESSIONS. The merchant doc (`merchants/{shop}`, the
  // api key) is shared with the other app and is NOT touched here — the two
  // apps are one merchant on one store, and the store leaving is shop/redact's
  // moment, 48 hours on, which asks whether the other app is still there
  // before it purges. Uninstalling one app must never blank the other's key.
  if (session) {
    const snapshot = await firestore
      .collection(SESSION_COLLECTION)
      .where("shop", "==", shop)
      .get();

    const batch = firestore.batch();
    snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
  }

  // PLAN PRECEDENCE, order 3 (plan-precedence.server.ts): when the Ritualist
  // leaves a store where ink is still installed, the merchant is handed back
  // to ink — plan → ink — so the link keeps working as ink. ink's own
  // uninstall changes no plan: with the Ritualist there the plan is already
  // its; without it the store is leaving. Outside the `if (session)` on
  // purpose, so a Shopify redelivery after our sessions are gone still runs
  // it (the PATCH is idempotent). Response by the retryability doctrine:
  // Firestore cannot say whether ink is there, or the backend blipped →
  // 500 and Shopify retries; the backend REFUSED (4xx — a door that does not
  // know `plan` yet) → logged loud and acked, a retry cannot change it.
  if (!isInk()) {
    let outcome: Awaited<ReturnType<typeof restoreInkPlanOnRitualistUninstall>>;
    try {
      outcome = await restoreInkPlanOnRitualistUninstall(shop);
    } catch (error) {
      console.error(`[${topic}] ${shop}: could not check whether ink is still installed — will retry:`, error);
      return new Response("plan hand-back deferred — will retry", { status: 500 });
    }
    if (outcome === "transient_failure") {
      return new Response("plan hand-back failed — will retry", { status: 500 });
    }
  }

  return new Response();
};
