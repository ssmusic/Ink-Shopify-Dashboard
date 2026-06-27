import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import { enrollOrder, createMerchant } from "../services/ink-api.server";

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

/**
 * The merchant's INK api_key — the Bearer Alan's /api/enroll (requireMerchant)
 * needs. Same source the warehouse enroll uses.
 */
async function getMerchantApiKey(shopDomain: string): Promise<string | null> {
  try {
    const snapshot = await firestore
      .collection("merchants")
      .where("shopDomain", "==", shopDomain)
      .limit(1)
      .get();
    let data = snapshot.empty ? null : snapshot.docs[0].data();
    if (!data) {
      const direct = await firestore.collection("merchants").doc(shopDomain).get();
      if (direct.exists) data = direct.data() ?? null;
    }
    const key = data?.ink_api_key;
    return key && key !== "sk_test_fallback" ? key : null;
  } catch (e) {
    console.warn(`[orders/create] getMerchantApiKey failed for ${shopDomain}:`, e);
    return null;
  }
}

function genNfcToken(): string {
  return `nfc_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
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

// Order detail fetch for auto-enroll — line items (incl. product image +
// variant id), customer (incl. buyer-history profile: order count, lifetime
// spend, tags, marketing consent), shipping address, total, acquisition source,
// and the existing proof_reference metafield (for idempotency).
//
// Buyer-profile fields verified valid in Admin API 2024-10 / 2025-10:
//   Customer.id, .numberOfOrders (UnsignedInt64 → string), .amountSpent (MoneyV2),
//   .tags ([String!]!), .emailMarketingConsent/.smsMarketingConsent { marketingState }.
//   Order.sourceName (String, nullable). All nullable — handle null downstream.
//   (landing_site / referring_site are NOT fetched here — they live under
//    customerJourneySummary which needs extra analytics scope. We read them
//    from the order webhook payload instead, where they're already present.)
const ORDER_DETAIL_QUERY = `
  query AutoEnrollOrder($id: ID!) {
    order(id: $id) {
      id
      name
      sourceName
      customer {
        id
        email
        phone
        firstName
        lastName
        numberOfOrders
        amountSpent { amount currencyCode }
        tags
        emailMarketingConsent { marketingState }
        smsMarketingConsent { marketingState }
      }
      shippingAddress { name address1 address2 city province zip country }
      totalPriceSet { shopMoney { amount currencyCode } }
      lineItems(first: 20) {
        edges {
          node {
            title
            quantity
            sku
            originalUnitPriceSet { shopMoney { amount } }
            image { url }
            variant { id }
          }
        }
      }
      metafield(namespace: "ink", key: "proof_reference") { value }
      fulfillments { trackingInfo { company number } }
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

    // ─── AUTO-ENROLL ────────────────────────────────────────────────
    // Create the Parallel proof now so the order autopopulates into Parallel
    // Orders (the merchant later just writes the tap URL onto a physical
    // sticker). Soft-fail: this must NEVER break order tagging / the webhook —
    // if it fails, the order stays tagged and can be enrolled later.
    let proofReference = "";
    let inkToken = "";
    let verificationStatus = "pending";
    try {
      const apiKey = await getMerchantApiKey(shop);
      if (!apiKey) {
        console.warn(
          `[orders/create] No ink_api_key for ${shop} — order tagged, auto-enroll skipped`
        );
      } else {
        const odRes = await admin.graphql(ORDER_DETAIL_QUERY, {
          variables: { id: orderGid },
        });
        const odJson = await odRes.json();
        const order = odJson?.data?.order;
        const already = order?.metafield?.value;

        if (already) {
          // Idempotent: webhook retried (Shopify is at-least-once) — already enrolled.
          console.log(
            `[orders/create] Order ${orderName} already enrolled (proof ${already}); skipping re-enroll`
          );
          proofReference = already;
          verificationStatus = "enrolled";
        } else if (order) {
          const numericOrderId =
            String(data?.id ?? "").replace(/\D/g, "") ||
            String(order.name ?? "").replace(/\D/g, "");
          const lineItems = (order.lineItems?.edges || []).map((e: any) => e.node);
          const product_details = lineItems.map((n: any) => ({
            name: n.title,
            sku: n.sku || "",
            quantity: n.quantity ?? 1,
            price: n.originalUnitPriceSet?.shopMoney?.amount ?? "0",
            image_url: n.image?.url || null,
            // Variant id → the backend has a validated slot for this; the
            // first-tap resolver uses it to map product → variant page.
            variant_id: n.variant?.id || null,
          }));

          // ─── Buyer profile (additive, null-safe) ─────────────────────────
          // Everything degrades gracefully for guest checkout (no customer
          // object): customer_profile stays null and the backend tiers as 'new'.
          const c = order.customer;
          const customer_profile = c
            ? {
                customer_id: c.id || null,
                // numberOfOrders is UnsignedInt64 (string) — coerce to int.
                orders_count: c.numberOfOrders != null ? Number(c.numberOfOrders) : 0,
                // amountSpent.amount is a Decimal string — keep as-is; backend coerces.
                total_spent: c.amountSpent?.amount ?? "0",
                currency: c.amountSpent?.currencyCode || null,
                tags: Array.isArray(c.tags) ? c.tags : [],
                // Pass the enum string straight through; the backend normalizes
                // SUBSCRIBED/NOT_SUBSCRIBED/etc. into a tri-state boolean.
                email_consent: c.emailMarketingConsent?.marketingState ?? null,
                sms_consent: c.smsMarketingConsent?.marketingState ?? null,
              }
            : null;

          // Acquisition: sourceName from GraphQL; landing/referring from the
          // raw order webhook payload (already in hand, no extra scope/fetch).
          const acquisition = {
            source_name: order.sourceName || data?.source_name || null,
            landing_site: data?.landing_site || null,
            referring_site: data?.referring_site || null,
          };
          const addr = order.shippingAddress;
          // Recipient/customer name — Alan's order mapper reads
          // shipping_address.name as the customer name fallback, so carry it
          // through (the order webhook never used to fetch a name → blank
          // "Customer" + "Ship To" in Parallel).
          const recipientName =
            addr?.name ||
            [order.customer?.firstName, order.customer?.lastName]
              .filter(Boolean)
              .join(" ") ||
            "";
          const shipping_address = addr
            ? {
                name: recipientName,
                line1: addr.address1 || "",
                line2: addr.address2 || "",
                city: addr.city || "",
                state: addr.province || "",
                zip: addr.zip || "",
                country: addr.country || "",
              }
            : recipientName
              ? { name: recipientName }
              : "Not Provided";

          let carrier_name: string | null = null;
          let tracking_number: string | null = null;
          for (const f of order.fulfillments || []) {
            const ti = f?.trackingInfo;
            if (ti && ti.length > 0) {
              carrier_name = ti[0]?.company || null;
              tracking_number = ti[0]?.number || null;
              if (carrier_name || tracking_number) break;
            }
          }

          // Order total → forwarded into order_details (the interactive enroll
          // path already does this; the auto path used to drop it).
          const total_price = order.totalPriceSet?.shopMoney?.amount ?? null;
          const order_currency = order.totalPriceSet?.shopMoney?.currencyCode ?? null;

          inkToken = genNfcToken();
          const runEnroll = (key: string) =>
            enrollOrder(
              key,
              numericOrderId,
              inkToken,
              order.name || numericOrderId,
              order.customer?.email || "unknown@example.com",
              shipping_address,
              product_details,
              undefined, // warehouse_location — none at order time
              undefined, // nfc_uid — no physical chip bound yet
              undefined, // photo_urls
              undefined, // photo_hashes
              carrier_name,
              tracking_number,
              finalPhone || order.customer?.phone || null,
              {
                total_price,
                currency: order_currency,
                customer_profile,
                acquisition,
              }
            );

          let inkData: any;
          try {
            inkData = await runEnroll(apiKey);
          } catch (e: any) {
            // Stale/invalid ink_api_key → re-provision a fresh one and retry
            // once (the same self-heal the warehouse enroll uses).
            if (/401|invalid api key|unauthorized/i.test(e?.message || "")) {
              console.warn(
                `[orders/create] ink_api_key rejected for ${shop}; re-provisioning + retrying…`
              );
              const fresh = await createMerchant(shop, shop, `admin@${shop}`);
              const freshKey = fresh?.api_key;
              if (!freshKey) throw e;
              const snap = await firestore
                .collection("merchants")
                .where("shopDomain", "==", shop)
                .limit(1)
                .get();
              if (!snap.empty) {
                await snap.docs[0].ref.update({ ink_api_key: freshKey, updatedAt: new Date() });
              } else {
                await firestore
                  .collection("merchants")
                  .doc(shop)
                  .set({ shopDomain: shop, ink_api_key: freshKey, updatedAt: new Date() }, { merge: true });
              }
              inkData = await runEnroll(freshKey);
            } else {
              throw e;
            }
          }
          proofReference = inkData?.proof_id || "";
          verificationStatus = proofReference ? "enrolled" : "pending";
          console.log(
            `✅ [orders/create] Auto-enrolled ${orderName} → proof ${proofReference}, token ${inkToken}`
          );
        }
      }
    } catch (enrollErr: any) {
      console.warn(
        `[orders/create] Auto-enroll soft-failed for ${orderName} (order still tagged):`,
        enrollErr?.message || enrollErr
      );
    }

    // Initialize / update INK metafields — proof_reference + ink_token are now
    // real (when auto-enroll succeeded) so the order is linked to its proof and
    // the warehouse knows which tap URL to write onto the sticker.
    const metafieldRes = await admin.graphql(METAFIELD_MUTATION, {
      variables: {
        metafields: [
          {
            ownerId: orderGid,
            namespace: "ink",
            key: "verification_status",
            type: "single_line_text_field",
            value: verificationStatus,
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
            value: proofReference,
          },
          {
            ownerId: orderGid,
            namespace: "ink",
            key: "ink_token",
            type: "single_line_text_field",
            value: inkToken,
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
        ].filter((m) => m.value !== ""),
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
