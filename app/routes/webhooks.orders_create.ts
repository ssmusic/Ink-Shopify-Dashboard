import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";

/**
 * Look up the merchant's verified-delivery mode preference.
 * Defaults to "addon" (current behavior — only INK-shipped orders are tagged)
 * if no preference is stored yet.
 */
async function getMerchantDeliveryMode(
  shopDomain: string
): Promise<"addon" | "background"> {
  try {
    const snapshot = await firestore
      .collection("merchants")
      .where("shopDomain", "==", shopDomain)
      .limit(1)
      .get();
    let docData = snapshot.empty ? null : snapshot.docs[0].data();
    if (!docData) {
      const direct = await firestore.collection("merchants").doc(shopDomain).get();
      if (direct.exists) docData = direct.data() ?? null;
    }
    const mode = docData?.verified_delivery_mode;
    if (mode === "addon" || mode === "background") return mode;
    return "addon";
  } catch (e) {
    console.warn(
      `[orders/create] Failed to read delivery mode for ${shopDomain}, defaulting to addon:`,
      e
    );
    return "addon";
  }
}

const TAG_MUTATION = `
mutation AddOrderTag($id: ID!, $tags: [String!]!) {
  tagsAdd(id: $id, tags: $tags) {
    userErrors { field message }
  }
}
`;

const METAFIELD_MUTATION = `
mutation SetInkMetafields($metafields: [MetafieldsSetInput!]!) {
  metafieldsSet(metafields: $metafields) {
    userErrors { field message }
  }
}
`;

/**
 * Check if order has INK Verified Delivery shipping method selected.
 */
function hasInkPremiumShipping(shippingLines: any[]): boolean {
  for (const line of shippingLines || []) {
    const title = (line.title || "").toLowerCase();
    const code = (line.code || "").toLowerCase();
    const name = (line.name || "").toLowerCase();
    const combinedText = `${title} ${code} ${name}`.toLowerCase();

    if (
      combinedText.includes("ink premium") ||
      combinedText.includes("ink delivery") ||
      (combinedText.includes("premium delivery") && combinedText.includes("ink")) ||
      combinedText.includes("ink verified") ||
      combinedText.includes("verified delivery")
    ) {
      console.log(
        `✅ Found INK Verified Delivery: title="${line.title}", code="${line.code}"`
      );
      return true;
    }
  }
  return false;
}

export const action = async ({ request }: ActionFunctionArgs) => {
  console.log("[orders/create] Webhook received");

  // Use Shopify's helper for HMAC verification + payload parsing — same
  // pattern used by webhooks.fulfillments_update.tsx. Validates against the
  // app's API secret automatically; no hardcoded secret to drift.
  const { payload, shop, admin } = await authenticate.webhook(request);

  if (!admin) {
    console.warn(
      `[orders/create] No admin context available for ${shop} — webhook delivery without session, skipping`
    );
    return new Response("ok", { status: 200 });
  }

  const data = payload as any;
  const orderGid = data?.admin_graphql_api_id as string | undefined;
  const orderName = data?.name || data?.order_number || "Unknown";

  if (!orderGid) {
    console.error("[orders/create] Missing order id in payload");
    return new Response("Missing order id", { status: 400 });
  }

  console.log(`\n📦 [orders/create] Processing order ${orderName} (${shop})`);

  // Phone selection (ship → order → customer fallback chain)
  const shippingPhone = data?.shipping_address?.phone;
  const orderPhone = data?.phone;
  const customerPhone = data?.customer?.phone;
  const finalPhone = shippingPhone || orderPhone || customerPhone || "";
  console.log(
    `📱 Phone selection — shipping: ${shippingPhone || "—"}, order: ${orderPhone || "—"}, customer: ${customerPhone || "—"} → using: ${finalPhone || "—"}`
  );

  const shippingLines = data?.shipping_lines || [];
  console.log(`🚢 ${shippingLines.length} shipping line(s) on order`);

  const hasPremiumDelivery = hasInkPremiumShipping(shippingLines);

  // Mode-aware enrollment decision:
  //   • addon mode: only enroll if the customer chose the INK shipping option
  //   • background mode: enroll every order on this shop regardless of
  //     shipping (INK is hidden from checkout in this mode anyway).
  const deliveryMode = await getMerchantDeliveryMode(shop);
  const shouldEnroll = hasPremiumDelivery || deliveryMode === "background";

  if (!shouldEnroll) {
    console.log(
      `📦 [orders/create] Order ${orderName} skipped — addon mode, no INK shipping selected`
    );
    return new Response("ok - addon mode, not INK");
  }

  if (deliveryMode === "background") {
    console.log(
      `🛡️ [orders/create] Order ${orderName} auto-enrolling — merchant is in background mode`
    );
  } else {
    console.log(
      `🛡️ [orders/create] Order ${orderName} has INK Verified Delivery!`
    );
  }

  try {
    // Tag the order
    const tagRes = await admin.graphql(TAG_MUTATION, {
      variables: { id: orderGid, tags: ["INK-Verified-Delivery"] },
    });
    const tagJson = await tagRes.json();
    const tagErrors = tagJson?.data?.tagsAdd?.userErrors;
    if (tagErrors && tagErrors.length > 0) {
      console.error(`[orders/create] tagsAdd userErrors:`, tagErrors);
    } else {
      console.log(
        `✅ [orders/create] Tagged order ${orderName} with "INK-Verified-Delivery"`
      );
    }

    // Initialize INK metafields
    const metafieldRes = await admin.graphql(METAFIELD_MUTATION, {
      variables: {
        metafields: [
          {
            ownerId: orderGid,
            namespace: "ink",
            key: "verification_status",
            type: "single_line_text_field",
            value: "pending",
          },
          {
            ownerId: orderGid,
            namespace: "ink",
            key: "delivery_type",
            type: "single_line_text_field",
            value: deliveryMode === "background" ? "background" : "premium",
          },
          {
            ownerId: orderGid,
            namespace: "ink",
            key: "proof_reference",
            type: "single_line_text_field",
            value: "",
          },
          {
            ownerId: orderGid,
            namespace: "ink",
            key: "nfc_uid",
            type: "single_line_text_field",
            value: "",
          },
          {
            ownerId: orderGid,
            namespace: "ink",
            key: "customer_phone",
            type: "single_line_text_field",
            value: finalPhone,
          },
        ],
      },
    });
    const metafieldJson = await metafieldRes.json();
    const metaErrors = metafieldJson?.data?.metafieldsSet?.userErrors;
    if (metaErrors && metaErrors.length > 0) {
      console.error(`[orders/create] metafieldsSet userErrors:`, metaErrors);
    } else {
      console.log(`✅ [orders/create] Metafields initialized for ${orderName}`);
    }
  } catch (error: any) {
    console.error(
      `❌ [orders/create] Error processing ${orderName}:`,
      error?.message || error
    );
    return new Response("Error processing order", { status: 500 });
  }

  console.log(
    `✅ [orders/create] Successfully processed order ${orderName} (mode=${deliveryMode})\n`
  );
  return new Response("ok");
};
