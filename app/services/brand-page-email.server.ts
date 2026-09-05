// WHEN SHOPIFY'S EMAIL ALREADY WENT OUT — the brand emails the page itself.
//
// The other half of Sam's 2026-09-05 ruling. `shopify-shipping-notice.server.ts`
// covers the merchant who fulfilled WITHOUT notifying: Shopify sends one
// shipping update and its tracking button is the brand's page. The merchant who
// DID notify has already spent the buyer's shipping email on the carrier's URL,
// and rule 4 forbids a second one from Shopify — correctly, because Shopify
// would send it from the merchant's template as if nothing had happened.
//
// So this rail exists for that case only: one short email, from the brand, with
// the page in it. It is TRANSACTIONAL — it tells a buyer where the thing they
// bought is — and it is DEFAULT OFF, because a second email to someone else's
// customer is the merchant's call and not ours (Sam can flip the default; the
// PR says so under "For Sam").
//
// WHERE THE SENDING LIVES, AND WHY NOT HERE. Measured 2026-09-05: the Cloud Run
// service `shopify-app` carries SENDGRID_API_KEY and no RESEND_API_KEY. Resend
// is bound on the Cloudflare Worker, together with RESEND_WEBHOOK_SECRET and —
// the deciding fact — the SUPPRESSION LIST (`outreach-suppress:{address}` in
// the DEMO_REGISTRY namespace, written by Resend's bounce webhook and read
// fail-closed). An address that hard-bounced or complained must never be mailed
// again by anything ink runs, and a second suppression list living in this repo
// would be the "copy that drifted from its original" failure this codebase has
// paid for more than once. So the Worker sends and this module decides.
//
// THE OUTREACH RAIL IS NOT TOUCHED. Its allowlist and its 25-a-day cap are
// fences around COLD LETTERS TO STRANGERS. This is a buyer who just bought
// something, and it rides a separate Worker route with its own fences; nothing
// here loosens anything there.
//
// FIVE REFUSALS, all of them returned in words and logged:
//   1. the switch (env kill switch, then the merchant's own — DEFAULT OFF)
//   2. no shared secret configured ⇒ nothing is attempted (the Worker refuses
//      too, so the fence exists on both sides of the wire)
//   3. no usable recipient, or no page to point at
//   4. a test-flagged merchant may only ever reach its OWN address
//   5. one email per order, ever — stamped on the order after a real send
//
// The Worker holds the same last three again, plus suppression and the daily
// cap, because a fence that only one side enforces is a fence with a gate in it.

import { WORKER_BASE } from "./brand-email.server";
import { resolveBrandPageUrl } from "./brand-page-url.server";

type Loose = Record<string, unknown>;

export interface GraphqlAdmin {
  graphql: (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

const NAMESPACE = "ink";
export const SENT_KEY = "page_email_sent";
export const BUYER_MAIL_PATH = "/api/buyer/page-email";

export type BrandPageEmailOutcome =
  | "sent"
  | "skipped_disabled_env"
  | "skipped_disabled_merchant"
  | "skipped_no_secret"
  | "skipped_no_recipient"
  | "skipped_no_page_url"
  | "skipped_test_merchant"
  | "skipped_already_sent"
  | "refused_by_worker"
  | "failed";

export interface BrandPageEmailResult {
  outcome: BrandPageEmailOutcome;
  /** Plain words. A refusal that is not returned and rendered is worse than
   *  the bug it prevents. */
  detail: string;
}

const SENT_CHECK = `#graphql
  query InkBrandPageEmailSent($orderId: ID!) {
    order(id: $orderId) {
      name
      metafield(namespace: "${NAMESPACE}", key: "${SENT_KEY}") { value }
    }
  }
`;

const STAMP = `#graphql
  mutation InkBrandPageEmailStamp($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

/** A deliberately narrow shape check. A bounce is what kills a sending domain,
 *  and in.ink also carries every merchant's own mail. */
export function looksLikeAnAddress(value: unknown): boolean {
  const s = String(value ?? "").trim();
  if (!s || s.length > 254 || /\s/.test(s)) return false;
  return /^[^@\s]+@[^@\s.]+(\.[^@\s.]+)+$/.test(s);
}

/** DEFAULT OFF. Only an explicit `true` turns this on for a shop — the mirror
 *  image of `branded_tracking_link`, and deliberately so: that one is a link
 *  the merchant already sends, this one is a new email to their customer. The
 *  rule lives with the other two switches. */
export { brandPageEmailEnabled } from "./tracking-card-switches";

/** The merchant's own addresses — the only ones a test-flagged shop may reach. */
function ownAddressesOf(brandDoc: Loose): string[] {
  const fromEnv = (process.env.SEND_ALLOWLIST || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return [
    ...fromEnv,
    ...[brandDoc?.owner_email, brandDoc?.support_email, brandDoc?.email]
      .map((v) => String(v ?? "").trim().toLowerCase())
      .filter(Boolean),
  ];
}

/**
 * One email, from the brand, carrying the page — for a buyer whose shipping
 * email has already gone out with the carrier's link in it.
 *
 * Never throws: this runs on the fulfillment webhook path, where the only
 * unforgivable outcome is a non-200.
 */
export async function sendBrandPageEmailOnce({
  admin,
  shop,
  orderGid,
  orderName,
  customerEmail,
  proofId,
  fulfillmentId,
  merchantApiKey,
  merchantData,
  fetchImpl = fetch,
  label = "brand-page-email",
}: {
  admin: GraphqlAdmin;
  shop: string;
  orderGid: string;
  orderName: string;
  customerEmail: string | null | undefined;
  proofId: string;
  fulfillmentId: string;
  merchantApiKey?: string | null;
  merchantData: Loose;
  fetchImpl?: typeof fetch;
  label?: string;
}): Promise<BrandPageEmailResult> {
  try {
    if (process.env.BRAND_PAGE_EMAIL_DISABLED) {
      console.log(`✉️ ${label}: OFF by env — the brand sends nothing.`);
      return { outcome: "skipped_disabled_env", detail: "turned off everywhere by the env kill switch" };
    }
    if (merchantData?.brand_page_email !== true) {
      console.log(`✉️ ${label}: OFF for ${shop} (default) — no second email.`);
      return {
        outcome: "skipped_disabled_merchant",
        detail: "this shop has not turned on the brand's own email",
      };
    }
    const secret = process.env.BUYER_MAIL_SECRET;
    if (!secret) {
      console.warn(
        `✉️ ${label}: BUYER_MAIL_SECRET is not set on this service — the brand's email cannot be sent. ` +
          `Set the same value here and on the Worker.`,
      );
      return { outcome: "skipped_no_secret", detail: "the shared secret for the mail rail is not configured" };
    }
    if (!looksLikeAnAddress(customerEmail)) {
      console.log(`✉️ ${label}: ${orderName} has no usable customer address — nothing to send to.`);
      return { outcome: "skipped_no_recipient", detail: "the order carries no usable email address" };
    }
    const to = String(customerEmail).trim();

    // ONE AUTHOR for the page address, the brand slug and the brand doc — the
    // same resolution the tracking rewrite and the order door use.
    const resolved = await resolveBrandPageUrl({ merchantApiKey, proofId, shop, merchantData, label });
    if (!resolved.pageUrl || !resolved.brandDoc?.brand_slug) {
      console.log(
        `✉️ ${label}: no page for ${orderName} (slug=${resolved.brandDoc?.brand_slug ? resolved.brandSlug : "none"}, ` +
          `token=${resolved.nfcToken ?? "none"}) — refusing to email a host nobody serves.`,
      );
      return { outcome: "skipped_no_page_url", detail: "this order has no brand page address yet" };
    }
    const brandDoc = resolved.brandDoc;

    // A test-flagged merchant may only ever reach its own inbox. Same rule as
    // the state emails, and the Worker enforces it again from `test_context`.
    const isTest = Boolean(brandDoc.returns_test_mode || brandDoc.is_test);
    if (isTest && !ownAddressesOf(brandDoc).includes(to.toLowerCase())) {
      console.log(`✉️ ${label}: ${shop} is a test shop — refusing to reach a real customer.`);
      return {
        outcome: "skipped_test_merchant",
        detail: "this is a test shop, so only the merchant's own address can be reached",
      };
    }

    // ONE PER ORDER, EVER. Checked here so a repeat costs nothing on the wire;
    // the Worker's own key per fulfillment catches anything that gets past it.
    const check = await admin.graphql(SENT_CHECK, { variables: { orderId: orderGid } });
    const checkJson = (await check.json()) as Loose;
    const checkedOrder = (checkJson?.data as Loose | undefined)?.order as Loose | undefined;
    const already = (checkedOrder?.metafield as Loose | undefined)?.value;
    if (already) {
      console.log(`✉️ ${label}: ${orderName} already had the brand's email (${String(already)}) — never twice.`);
      return { outcome: "skipped_already_sent", detail: `already sent for this order (${String(already)})` };
    }

    const body = {
      shop_id: resolved.proofShopId || shop,
      fulfillment_id: String(fulfillmentId),
      order_name: orderName,
      to,
      brand_slug: resolved.brandSlug,
      brand_name:
        (brandDoc.shop_name as string | undefined) ||
        (brandDoc.name as string | undefined) ||
        resolved.brandSlug,
      page_url: resolved.pageUrl,
      reply_to:
        (brandDoc.support_email as string | undefined) ||
        (brandDoc.owner_email as string | undefined) ||
        null,
      postal_address: postalLineOf(brandDoc),
      test_context: isTest,
      owner_email:
        (brandDoc.owner_email as string | undefined) ||
        (brandDoc.support_email as string | undefined) ||
        null,
    };

    const res = await fetchImpl(`${WORKER_BASE}${BUYER_MAIL_PATH}`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Buyer-Mail-Secret": secret },
      body: JSON.stringify(body),
    });
    const json = (await res.json().catch(() => null)) as Loose | null;

    if (!res.ok || json?.ok !== true) {
      // RELAY THE RAIL'S OWN WORDS. A status code we chose carries no diagnosis.
      const detail = String(json?.error || json?.reason || `HTTP ${res.status}`);
      console.warn(`✉️ ${label}: the mail rail refused ${orderName} — ${detail}`);
      return { outcome: "refused_by_worker", detail };
    }
    if (json?.sent !== true) {
      const detail = String(json?.reason || "the rail accepted it and sent nothing");
      console.log(`✉️ ${label}: nothing sent for ${orderName} — ${detail}`);
      return { outcome: "refused_by_worker", detail };
    }

    // STAMP AFTER A REAL SEND, never before: a failed send must stay retryable.
    const stamp = await admin.graphql(STAMP, {
      variables: {
        metafields: [
          {
            ownerId: orderGid,
            namespace: NAMESPACE,
            key: SENT_KEY,
            type: "single_line_text_field",
            value: new Date().toISOString(),
          },
        ],
      },
    });
    const stampJson = (await stamp.json()) as Loose;
    const stampSet = (stampJson?.data as Loose | undefined)?.metafieldsSet as Loose | undefined;
    const stampErrors = (stampSet?.userErrors as Loose[] | undefined) ?? [];
    if (stampErrors.length > 0) {
      console.warn(
        `✉️ ${label}: sent for ${orderName} but the stamp failed — the Worker's own key is the remaining guard: ` +
          stampErrors.map((e) => String(e?.message ?? e)).join("; "),
      );
    }
    console.log(`✅ ${label}: ${orderName} — the brand emailed the page to the buyer.`);
    return { outcome: "sent", detail: "the brand emailed the page" };
  } catch (e) {
    const said = e instanceof Error ? e.message : String(e);
    console.error(`✉️ ${label}: threw (non-fatal) — ${said}`);
    return { outcome: "failed", detail: said };
  }
}

/** The merchant's postal address as one line, from the return address they
 *  already gave the returns rail. Null when the record does not carry one —
 *  the email then goes without it and the log says so, rather than inventing
 *  an address for a real brand (the Clare-V law). */
export function postalLineOf(brandDoc: Loose): string | null {
  const a = brandDoc?.return_address as Loose | undefined;
  if (!a || typeof a !== "object") return null;
  const parts = [a.name, a.company, a.street1 ?? a.address1, a.street2 ?? a.address2, a.city, a.state ?? a.province, a.zip ?? a.postal_code, a.country]
    .map((v) => String(v ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(", ") : null;
}
