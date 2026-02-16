import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { shop, session, topic } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // Webhook requests can trigger multiple times and after an app has already been uninstalled.
  // If this webhook already ran, the session may have been deleted previously.
  if (session) {
    const snapshot = await firestore
      .collection("shopify_sessions")
      .where("shop", "==", shop)
      .get();

    const batch = firestore.batch();
    snapshot.docs.forEach((doc: any) => batch.delete(doc.ref));
    await batch.commit();
  }

  return new Response();
};
