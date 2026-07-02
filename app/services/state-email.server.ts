// State emails on truthful triggers (Phase-1, 2026-07-02). Until now the
// only branded send fired from api.verify — i.e. on page OPEN — which
// claimed arrival whenever it ran, including before delivery. This module
// ties each claim to the event that makes it true:
//   shipped   → fulfillments/create, right after the tracking hop lands
//               ("on its way — track it", CTA = the live page)
//   delivered → fulfillments/update `delivered`, right after the proof is
//               marked delivered (the arrival email)
//
// Send discipline mirrors api.verify exactly (Bible §20):
//   - SEND_VERIFY_EMAIL=true is the env master switch (dev default: off)
//   - SEND_ALLOWLIST, when set, is the only audience mail can reach
//   - test-flagged merchants (returns_test_mode / is_test) never reach real
//     customers; an allowlisted recipient may still receive (that's the point)
//   - merchant outreach toggles (email_enabled / delivered_on) are honored
//
// Idempotency: one email per state per order, enforced with the
// ink.shipped_email_sent / ink.arrival_email_sent order metafields (Shopify
// redelivers webhooks and carriers repeat scans; the customer gets ONE of each).

import { EmailService, brandSlugFromDomain } from "./email.server";
import { fetchBrandEmailKit, selectEmailCampaign } from "./brand-email.server";
import { getProof } from "./ink-api.server";

const INK_NAMESPACE = "ink";
const SENT_KEYS = {
  shipped: "shipped_email_sent",
  delivered: "arrival_email_sent",
} as const;

interface StateEmailArgs {
  state: "shipped" | "delivered";
  admin: any; // Shopify admin GraphQL client from authenticate.webhook
  shop: string;
  orderGid: string;
  orderName: string;
  customerEmail: string | null | undefined;
  customerName: string;
  proofId: string;
  merchantData: Record<string, any>; // resolved merchant doc (findMerchantDoc)
}

export async function sendStateEmailOnce(args: StateEmailArgs): Promise<void> {
  const {
    state,
    admin,
    shop,
    orderGid,
    orderName,
    customerEmail,
    customerName,
    proofId,
    merchantData,
  } = args;

  const SENT_KEY = SENT_KEYS[state];
  const label = state === "shipped" ? "shipped email" : "arrival email";

  if (process.env.SEND_VERIFY_EMAIL !== "true") {
    console.log(`📧 SKIP ${label} (SEND_VERIFY_EMAIL is not 'true').`);
    return;
  }
  if (!customerEmail) {
    console.log(`📧 SKIP ${label} (order has no customer email).`);
    return;
  }

  // ── Gates (same semantics as api.verify) ──
  const isTestMerchant = Boolean(merchantData.returns_test_mode || merchantData.is_test);
  const sendAllowlist = (process.env.SEND_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  const recipientAllowlisted = sendAllowlist.includes(customerEmail.trim().toLowerCase());

  if (sendAllowlist.length > 0 && !recipientAllowlisted) {
    console.log(`📧 SKIP ${label} (allowlist): ${customerEmail} not on SEND_ALLOWLIST.`);
    return;
  }
  if (isTestMerchant && !recipientAllowlisted) {
    console.log(`📧 SKIP ${label} (test-mode merchant): refusing real customer send for ${customerEmail}.`);
    return;
  }
  const outreach = (merchantData.outreach as Record<string, any> | undefined) || {};
  const notifications = (outreach.notifications as Record<string, any> | undefined) || {};
  const emailEnabled = typeof notifications.email_enabled === "boolean" ? notifications.email_enabled : true;
  // delivered_on is the merchant's arrival-moment toggle; there is no
  // per-state shipped toggle yet, so shipped rides email_enabled alone.
  const deliveredOn = typeof notifications.delivered_on === "boolean" ? notifications.delivered_on : true;
  if (!emailEnabled || (state === "delivered" && !deliveredOn)) {
    console.log(`📧 SKIP ${label} (merchant outreach off): email_enabled=${emailEnabled}, delivered_on=${deliveredOn}.`);
    return;
  }

  // ── Idempotency: has this order already had this state's email? ──
  const check = await admin.graphql(
    `query StateEmailSent($id: ID!) {
      order(id: $id) {
        metafield(namespace: "${INK_NAMESPACE}", key: "${SENT_KEY}") { value }
        lineItems(first: 1) { edges { node { title image { url } } } }
      }
    }`,
    { variables: { id: orderGid } },
  );
  const checkJson = await check.json();
  if (checkJson.data?.order?.metafield?.value) {
    console.log(`📧 SKIP ${label} (already sent ${checkJson.data.order.metafield.value}) for ${orderName}.`);
    return;
  }
  const firstItem = checkJson.data?.order?.lineItems?.edges?.[0]?.node;
  const productName: string | undefined = firstItem?.title || undefined;
  const productImageUrl: string | undefined = firstItem?.image?.url || undefined;

  // ── Proof (authoritative): nfc_token for the page link, tier for aiming ──
  const merchantApiKey: string | undefined = merchantData.ink_api_key;
  let nfcToken: string | undefined;
  let customerTier: string | null = null;
  let proofShopId = "";
  if (merchantApiKey) {
    try {
      const proof = await getProof(merchantApiKey, proofId);
      nfcToken = proof?.nfc_token || undefined;
      customerTier = (proof?.customer_tier as string | undefined) || null;
      proofShopId = String(proof?.shop_id || "");
    } catch (e: any) {
      console.warn(`📧 ${label}: proof fetch failed (${e?.message}) — sending with fallback link.`);
    }
  }

  // ── Branded sender + the same live link the physical tag resolves to ──
  const brandDomain =
    (merchantData.shop_domain as string | undefined) ||
    (merchantData.shopDomain as string | undefined) ||
    shop;
  const brandSlug =
    brandSlugFromDomain(merchantData.brand_slug as string | undefined) ||
    brandSlugFromDomain(brandDomain);
  const senderFromEmail = brandSlug && brandSlug.length >= 2 ? `${brandSlug}@in.ink` : undefined;
  const senderFromName =
    (merchantData.shop_name as string | undefined) ||
    (merchantData.name as string | undefined) ||
    undefined;
  const senderReplyTo =
    (merchantData.support_email as string | undefined) ||
    (merchantData.owner_email as string | undefined) ||
    undefined;
  const proofUrl =
    brandSlug && nfcToken
      ? `https://${brandSlug}.in.ink/r/${nfcToken}`
      : `https://www.in.ink/r/${nfcToken || proofId}`;

  // ── Email-as-tap-page: brand kit + the buyer's aimed section (fail-soft) ──
  const brandKit = await fetchBrandEmailKit(proofShopId);
  const emailCampaign = brandKit
    ? selectEmailCampaign(brandKit.campaigns, {
        tier: customerTier,
        productTitles: [productName || ""],
      })
    : null;

  if (isTestMerchant) {
    console.log(`📧 DEV-MODE ${label} send: test-flagged merchant but ${customerEmail} is allowlisted — sending (from ${senderFromEmail || "notifications@in.ink"}).`);
  }

  const sent = await EmailService.sendReturnPassportEmail({
    brand: brandKit,
    campaign: emailCampaign,
    state,
    to: customerEmail,
    customerName,
    orderName,
    proofUrl,
    merchantName: senderFromName || shop.replace(".myshopify.com", ""),
    productImageUrl,
    productName,
    fromEmail: senderFromEmail,
    fromName: senderFromName,
    replyTo: senderReplyTo,
  });

  if (!sent) {
    console.error(`❌ ${label} send failed for ${orderName}; NOT stamping ${SENT_KEY} (will retry on the next event).`);
    return;
  }

  // Stamp AFTER a successful send: a failed send must stay retryable.
  const stamp = await admin.graphql(
    `mutation StampStateEmailSent($metafields: [MetafieldsSetInput!]!) {
      metafieldsSet(metafields: $metafields) {
        userErrors { field message }
      }
    }`,
    {
      variables: {
        metafields: [
          {
            ownerId: orderGid,
            namespace: INK_NAMESPACE,
            key: SENT_KEY,
            type: "single_line_text_field",
            value: new Date().toISOString(),
          },
        ],
      },
    },
  );
  const stampJson = await stamp.json();
  const stampErrors = stampJson.data?.metafieldsSet?.userErrors;
  if (stampErrors?.length) {
    console.warn(`⚠️ ${label} sent but stamp failed (duplicate possible on redelivery):`, stampErrors);
  } else {
    console.log(`✅ ${label} sent + stamped for ${orderName} → ${customerEmail}.`);
  }
}
