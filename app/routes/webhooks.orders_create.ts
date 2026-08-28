import type { ActionFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import { enrollOrder, createMerchant } from "../services/ink-api.server";
import { attachProductUrls, productDetailFromLineItem } from "../services/order-line-item";
import { findActivationDocRef } from "../services/merchant-doc.server";
import {
  countryOfWebhookOrder,
  orderActivates,
  productsActivate,
  scopeOfMerchant,
  stateOfWebhookOrder,
} from "../services/activation-scope.server";
import { spendFromCap } from "../services/activation-counter.server";

/**
 * Look up the merchant's verified-delivery mode preference.
 * Defaults to "background" so a missing preference never implies a
 * customer-paid checkout add-on.
 */
async function getMerchantDeliveryMode(
  shopDomain: string
): Promise<"background"> {
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
    if (mode === "background") return mode;
    return "background";
  } catch (e) {
    console.warn(
      `[orders/create] Failed to read delivery mode for ${shopDomain}, defaulting to background:`,
      e
    );
    return "background";
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

/** Ask for the line items' storefront URLs, and never let the answer matter.
 *
 *  Returns an index-aligned array, or `null` when the fetch failed for ANY
 *  reason — most importantly a missing `read_products` scope, which is the
 *  state of every install until the scope change ships and re-consent lands.
 *
 *  The refusal is LOGGED, not swallowed: a fallback that hides a failure makes
 *  the outage permanent and silent (TECH_BIBLE law 32). One line, naming the
 *  order and the reason, so "the product link is missing" is answerable from
 *  the logs instead of from a rebuild.
 */
async function fetchProductUrls(
  admin: any,
  orderGid: string,
  orderName: string,
): Promise<(string | null)[] | null> {
  try {
    const res = await admin.graphql(PRODUCT_URLS_QUERY, {
      variables: { id: orderGid },
    });
    const json = await res.json();
    const edges = json?.data?.order?.lineItems?.edges;
    if (!Array.isArray(edges)) {
      console.warn(
        `[orders/create] product URLs unavailable for ${orderName} — enroll continues without them (no lineItems in response)`,
      );
      return null;
    }
    return edges.map((e: any) => e?.node?.product?.onlineStoreUrl ?? null);
  } catch (err: any) {
    console.warn(
      `[orders/create] product URLs unavailable for ${orderName} — enroll continues without them:`,
      err?.message || err,
    );
    return null;
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

// Order detail fetch for auto-enroll — line items (incl. product image),
// customer, shipping address, total, and the existing proof_reference metafield
// (for idempotency).
//
// NOTHING OPTIONAL MAY RIDE THIS QUERY. It is the enroll-critical fetch: order
// name, customer, ship-to, line items, the idempotency metafield and the
// fulfillments all come from here, and a proof cannot be created without them.
//
// Shopify does not drop a field it cannot authorize — it fails the WHOLE
// query. So one selection the app lacks a scope for takes down enrollment for
// every order on every install, silently. That is not theory: #82 added
// `product { onlineStoreUrl }` here on 2026-08-09, the app has never held
// `read_products`, and real order #1019 came back
//     "Access denied for product field. Required access: `read_products`"
// — no proof, no metafields, no tracking-link rewrite, and the handler still
// logged ✅ and returned 200.
//
// Enrichment therefore lives in PRODUCT_URLS_QUERY below, fetched separately
// and fail-open. Adding a field to THIS query is a scope decision; treat it as
// one. (ENGINEERING_BIBLE §17; TECH_BIBLE laws 32 + 35.)
export const ORDER_DETAIL_QUERY = `
  query AutoEnrollOrder($id: ID!) {
    order(id: $id) {
      id
      name
      customer { email phone firstName lastName }
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
          }
        }
      }
      metafield(namespace: "ink", key: "proof_reference") { value }
      fulfillments { trackingInfo { company number } }
    }
  }
`;

// THE ENRICHMENT, ON ITS OWN WIRE. The product's public storefront page —
// `onlineStoreUrl` is null for a product not published to the Online Store
// channel, which is the honest answer; the tap page hides the link rather than
// sending a buyer somewhere that 404s.
//
// Requires the `read_products` scope. It is asked for separately and its
// failure is swallowed by design, so a missing or revoked scope costs exactly
// this link and never the enrollment.
export const PRODUCT_URLS_QUERY = `
  query AutoEnrollProductUrls($id: ID!) {
    order(id: $id) {
      lineItems(first: 20) {
        edges {
          node {
            product { onlineStoreUrl }
          }
        }
      }
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
    // Malformed payload — a Shopify retry can't fix it, so ack (200) instead of
    // 400. (A genuine processing error below still returns 500 on purpose, so
    // Shopify retries and the idempotent enroll — backend #23 — eventually lands.)
    console.error("[orders/create] Missing order id in payload; acking.");
    return new Response("ok - missing order id", { status: 200 });
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

  // Set by the enroll catch. Non-null ⇒ suppress the success line and return
  // 500 so Shopify retries. Declared out here because the success line lives
  // outside the processing try/catch.
  let enrollFailure: string | null = null;

  // Background enrollment: INK is hidden from checkout and never appears as a
  // customer-paid shipping option, so every order on this shop is eligible.
  const deliveryMode = await getMerchantDeliveryMode(shop);
  // The merchant doc FOR THE SLICE, through the slice's own resolver. A
  // connected store can hold TWO merchant docs, and the workspace's save can
  // only ever reach the ACTIVE one — reading the api-key doc here (as
  // findMerchantDocRef rightly does for enrolling) made a saved slice
  // invisible to this webhook (merchant-doc.server.ts tells the story).
  // Never fatal: an unreadable merchant means no slice, today's behaviour.
  const merchantForScope = await findActivationDocRef(firestore, shop).catch((e) => {
    console.warn(`[orders/create] Could not read merchant doc for ${shop}:`, e);
    return null;
  });
  const shouldEnroll = hasPremiumDelivery || deliveryMode === "background";

  if (!shouldEnroll) {
    console.log(`[orders/create] Order ${orderName} skipped — not eligible`);
    return new Response("ok - not eligible");
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

  // ─── THE SLICE ──────────────────────────────────────────────────────
  // A merchant may run their pilot on part of their business: a set number
  // of orders, certain places (a country as readily as a US state), certain
  // products. Whatever they narrowed by, it decides ACTIVATION only:
  //   • the order is enrolled either way — ink's backend gets every order
  //     the store sends ("we want all the data"), so widening the slice
  //     later reveals a history that was there all along;
  //   • an out-of-slice order gets NO Shopify tag and NO ink.* metafields,
  //     and every buyer-facing thing downstream gates on
  //     ink.proof_reference — the fulfillment webhooks early-return 200
  //     without it — so nothing ever reaches that customer.
  // Absent scope (every merchant today) ⇒ activates, exactly as before.
  const activationScope = scopeOfMerchant(merchantForScope?.data);

  // WHERE it ships is answerable right now, from the body Shopify already
  // sent — no query, no scope, no cost.
  const shipToOk = orderActivates(data, activationScope);
  if (!shipToOk) {
    console.log(
      `🔒 [orders/create] Order ${orderName} ships outside this merchant's chosen places ` +
        `(${[
          ...(activationScope?.ship_to?.countries ?? []),
          ...(activationScope?.ship_to?.states ?? []),
        ].join(", ")}; this order: ` +
        `${stateOfWebhookOrder(data) ?? countryOfWebhookOrder(data) ?? "nowhere readable"})` +
        ` — recording it, no page.`
    );
  }
  // WHAT is on it and WHETHER the cap has room are not answerable yet: the
  // first needs the order's lines, the second needs the tally. They start
  // UNKNOWN and are settled below, and unknown never counts as yes — a
  // merchant who narrowed by product or cap is fail-closed until the answer
  // actually arrives. A merchant with neither is true from the start, so
  // nothing about today's behaviour depends on the query succeeding.
  let productsOk: boolean | null = activationScope?.products ? null : true;
  let capOk: boolean | null = activationScope?.volume ? null : true;
  const activatesNow = () => shipToOk && productsOk === true && capOk === true;

  try {
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
          // NOT "order tagged" any more: a merchant who narrowed by product
          // or by a cap cannot be judged without the order read below, and
          // unknown never counts as yes — so a scoped merchant's order is
          // recorded and left un-activated rather than tagged on a guess.
          `[orders/create] No ink_api_key for ${shop} — auto-enroll skipped for ${orderName}`
        );
      } else {
        const odRes = await admin.graphql(ORDER_DETAIL_QUERY, {
          variables: { id: orderGid },
        });
        const odJson = await odRes.json();
        const order = odJson?.data?.order;
        const already = order?.metafield?.value;

        // ─── THE REST OF THE SLICE ──────────────────────────────────
        // The order's lines are in hand now, so the product question can be
        // answered — off the SAME query, with no field added to it (one
        // unauthorized selection there fails the whole query silently, which
        // is how order #1019 died).
        if (productsOk === null) {
          const lines = (order?.lineItems?.edges || []).map((e: any) => e.node);
          productsOk = productsActivate(lines, activationScope);
          if (!productsOk) {
            console.log(
              `🔒 [orders/create] Order ${orderName} holds none of this merchant's chosen ` +
                `products — recording it, no page.`
            );
          }
        }
        // And the cap, which only the tally can answer. Spent LAST, so a
        // cap is never burned on an order that was never going to get a
        // page for another reason. Idempotent across Shopify's redeliveries.
        if (capOk === null) {
          const cap = activationScope?.volume?.cap ?? 0;
          const ref = merchantForScope?.ref;
          if (!ref || !shipToOk || productsOk !== true) {
            // Nothing to spend it on, or nowhere to keep the count. Refusing
            // is the fail-closed side, and it spends nothing.
            capOk = false;
          } else {
            try {
              const decision = await spendFromCap(
                firestore, ref, shop, data?.id ?? orderGid, cap,
              );
              capOk = decision.ok;
              console.log(
                `[orders/create] ${orderName} cap ${decision.used}/${decision.cap}` +
                  `${decision.replay ? " (redelivery — already counted)" : ""}` +
                  `${decision.ok ? "" : " — spent, recording it, no page"}`
              );
            } catch (capErr: any) {
              // A tally we cannot read is not a permission. Fail closed and
              // say so; the order is still captured either way.
              capOk = false;
              console.error(
                `[orders/create] Could not read this merchant's cap for ${orderName}:`,
                capErr?.message || capErr
              );
            }
          }
        }

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
          // The enrichment, on its own wire and fail-open: a scope the app does
          // not hold costs the product link and nothing else. See
          // PRODUCT_URLS_QUERY.
          const product_details = attachProductUrls(
            lineItems.map(productDetailFromLineItem),
            await fetchProductUrls(admin, orderGid, orderName),
          );
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

          inkToken = genNfcToken();
          const runEnroll = (key: string) =>
            enrollOrder(
              key,
              numericOrderId,
              inkToken,
              order.name || numericOrderId,
              order.customer?.email || "",
              shipping_address,
              product_details,
              undefined, // warehouse_location — none at order time
              undefined, // nfc_uid — no physical chip bound yet
              undefined, // photo_urls
              undefined, // photo_hashes
              carrier_name,
              tracking_number,
              finalPhone || order.customer?.phone || null,
              // The buyer's own order-status page on the merchant's site.
              // Shopify has always sent it in this body; we never read it.
              { orderStatusUrl: data?.order_status_url || null, shopDomain: shop || null }
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
              const shopIdentityRes = await admin.graphql(`#graphql
                query ShopIdentity { shop { name email contactEmail } }
              `);
              const shopIdentity = (await shopIdentityRes.json())?.data?.shop;
              const ownerEmail = shopIdentity?.email || shopIdentity?.contactEmail || "";
              if (!ownerEmail) {
                console.warn(`[orders/create] Cannot re-provision ${shop} without a real Shopify contact email`);
                throw e;
              }
              const fresh = await createMerchant(shop, shopIdentity?.name || shop, ownerEmail);
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
          if (inkData?.already_enrolled && inkData?.nfc_token) {
            // Backend deduped on (shop_id, order_id) — this delivery was a
            // duplicate (Shopify is at-least-once). Stamp the EXISTING
            // proof's token, not the fresh one minted above, or the
            // ink_token metafield would point at a token that was never
            // enrolled.
            inkToken = inkData.nfc_token;
            console.log(
              `[orders/create] ${orderName} already enrolled on backend (proof ${proofReference}); aligned token`
            );
          } else {
            console.log(
              `✅ [orders/create] Auto-enrolled ${orderName} → proof ${proofReference}, token ${inkToken}`
            );
          }
        }
      }
    } catch (enrollErr: any) {
      // NAME THE REFUSAL, AND MAKE IT COUNT. This branch used to warn and fall
      // through to a `✅ Successfully processed` + 200, so a total enrollment
      // failure was indistinguishable from success in the logs AND told
      // Shopify never to retry. Order #1019 (2026-08-09) died exactly here:
      // the order was tagged, the ✅ printed, and no proof has ever existed.
      //
      // `enrollFailure` is read below: it suppresses the success line and
      // returns 500 so Shopify's at-least-once retry can land the enroll once
      // the cause is fixed. Retry is safe — the backend dedupes on
      // (shop_id, order_id) (ink-backend #23), and tagsAdd / metafieldsSet are
      // both idempotent.
      enrollFailure = enrollErr?.message || String(enrollErr);
      console.error(
        `❌ [orders/create] Auto-enroll FAILED for ${orderName} (order still tagged):`,
        enrollFailure
      );
    }

    // THE ANSWER IS SETTLED HERE, and everything below reads it.
    const activates = activatesNow();

    // Tag the order — the merchant's own mark, in their own admin, for the
    // orders ink runs on. It sits AFTER the enroll on purpose: the product
    // and cap answers only exist once the order has been read, and a tag
    // that promised a page we then withheld would be a lie in their admin.
    // Still tagged when the enroll itself failed (that order is in scope and
    // recoverable) — the behaviour the comment above depends on.
    if (activates) {
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
    }

    // Initialize / update INK metafields — proof_reference + ink_token are now
    // real (when auto-enroll succeeded) so the order is linked to its proof and
    // the warehouse knows which tap URL to write onto the sticker.
    //
    // THE SLICE'S REAL TEETH. Everything the buyer could ever see hangs off
    // ink.proof_reference: the branded tracking link, the order door, and
    // every state email all read it and early-return 200 when it is absent
    // (webhooks.fulfillments_create.tsx:69, fulfillments_update.tsx:171).
    // So an out-of-slice order is enrolled and recorded, and simply never
    // announced — one skip here, no suppression logic anywhere downstream.
    if (!activates) {
      console.log(
        `🔒 [orders/create] ${orderName} recorded (proof ${proofReference || "—"}) ` +
          `without metafields — outside the piece this pilot runs on.`
      );
    } else {
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
    }
  } catch (error: any) {
    console.error(
      `❌ [orders/create] Error processing ${orderName}:`,
      error?.message || error
    );
    return new Response("Error processing order", { status: 500 });
  }

  // A FAILED ENROLL IS NOT A PROCESSED ORDER. Saying so out loud, and asking
  // for the retry, is the whole point: the order is tagged but has no proof,
  // so the tap page, the receipt links and the branded tracking-link rewrite
  // (which gates on the ink.proof_reference metafield) all have nothing to
  // work with. 500 ⇒ Shopify redelivers; the backend's (shop_id, order_id)
  // dedupe makes that safe.
  if (enrollFailure) {
    console.error(
      `❌ [orders/create] ${orderName} NOT enrolled (mode=${deliveryMode}) — returning 500 so Shopify retries. Cause: ${enrollFailure}\n`
    );
    return new Response("enroll failed", { status: 500 });
  }

  console.log(
    `✅ [orders/create] Successfully processed order ${orderName} (mode=${deliveryMode}` +
      `${activatesNow() ? "" : ", recorded only — outside the piece this pilot runs on"})\n`
  );
  // 200 either way. An out-of-slice order is a DECISION, not a failure —
  // a 500 here would have Shopify redeliver it forever.
  return new Response("ok");
};
