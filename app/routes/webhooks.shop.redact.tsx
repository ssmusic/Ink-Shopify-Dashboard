import { type ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";

export const action = async ({ request }: ActionFunctionArgs) => {
  const { topic, shop, payload, webhookId } = await authenticate.webhook(request);

  console.log(`Received ${topic} webhook for ${shop}`);

  // SHOP/REDACT: 48 hours after uninstall, or when a store requests deletion.
  // We should delete the merchant record from Firestore.
  try {
      console.log(`[GDPR] Deleting merchant data for ${shop}`);
      await firestore.collection("merchants").doc(shop).delete();
  } catch (error) {
      console.error(`[GDPR] Failed to delete merchant data for ${shop}:`, error);
      // We still return 200 to acknowledge receipt
  }

  return new Response("OK", { status: 200 });
};
