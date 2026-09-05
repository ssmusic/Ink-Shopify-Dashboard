// SHOPIFY'S OWN SHIPPING EMAIL, CARRYING THE BRAND'S PAGE — the decision.
//
// SAM'S RULING, 2026-09-05: "there was a timing issue — the email from shopify
// should have a link to the buyers in.ink order."
//
// THE TIMING, MEASURED (Steve Madden order #1027, store sm-test-hhawzn52, read
// from Shopify's own order timeline):
//
//   01:59:28Z  fulfillment created
//   01:59:29Z  mail_sent · "Shipping confirmation" · delivery_status delivered
//   01:59:35Z  fulfillment_tracking_info_updated · by "The Ritualist"
//
// Shopify composes the shipping email at the instant of fulfillment. Our
// branded rewrite lands SIX SECONDS later, and it lands with
// `notifyCustomer:false` — so the email the buyer actually opened carried
// ups.com. Nothing of ours runs earlier than Shopify's own composer, and no
// API can edit a notification template. The one lever left is the SECOND email
// Shopify will send about a tracking change: the merchant's own template, from
// the merchant's own sending domain, whose tracking button renders whatever
// URL the fulfillment carries at compose time — ours.
//
// WHICH TEMPLATE. Shopify's help centre states the trigger of each customer
// notification: "Shipping confirmation — Sent when an order is fulfilled";
// "Shipping update — Sent when tracking information is updated"
// (https://help.shopify.com/en/manual/fulfillment/setup/notifications/customer-notifications).
// So a notifying `fulfillmentTrackingInfoUpdate` sends SHIPPING UPDATE, never
// Shipping confirmation. The confirmation is unreachable by any app; only the
// merchant's pasted Liquid line can put the page in that one (embed #105).
//
// RULE 4 NOW MEANS WHAT IT SAYS. `branded-tracking-link.server.ts` reads:
// "rewriting a link must never re-send a shipping email to a buyer who already
// got one." The implementation pinned notifyCustomer to false for EVERY buyer,
// including the ones who got nothing at all — a merchant who fulfills with the
// notification unticked (3PLs, ShipStation, bulk fulfillment) sends their buyer
// no shipping email whatsoever, and we then refuse to send the one that would
// have carried the brand. This module supplies the missing half of the
// sentence: has this buyer already got one?
//
// THE SIGNAL, AND WHY IT IS NOT A STRING MATCH. Shopify records every customer
// email it sends as an order event with `action: "mail_sent"`; `arguments[0]`
// names the template ("Shipping confirmation", "Order Confirmation"). That name
// is merchant-facing prose and is localized, so matching on it would be a fence
// that quietly opens in French. We match on TIME instead: any `mail_sent` at or
// after the fulfillment's own creation is, by construction, an email about this
// shipment — an order confirmation fires when the order is placed, which on
// #1027 was seven hours earlier. The template names are logged verbatim anyway,
// so the real distribution accumulates in the Cloud Run log the way the
// carrier-skip log accumulates carriers.
//
// FAIL CLOSED, ALWAYS TOWARDS SILENCE. Every uncertainty — an unreadable
// timeline, a fulfillment too young for the mail event to have landed, a
// missing order id — resolves to "do not notify". The cost of a wrong NO is
// today's behaviour. The cost of a wrong YES is a second email in a stranger's
// inbox, which is not ours to spend.

/** Anything Shopify hands back, before we have looked at it. */
type Loose = Record<string, unknown>;

export interface GraphqlAdmin {
  graphql: (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

const NAMESPACE = "ink";
/** One order, one notice from us, ever. The value is the fulfillment id we
 *  notified for, so the log can say which parcel spoke. A split shipment gets
 *  ONE email because the page is per ORDER — it shows the whole order, and a
 *  second email would point at the same page. */
export const NOTICE_KEY = "shipping_notice";

/** How old a fulfillment must be before "no mail yet" is trustworthy.
 *  Shopify stamped the mail_sent event ONE second after the fulfillment on the
 *  measured order, and our own rewrite arrives at about six; three seconds is
 *  the margin between those two facts, and it is logged on every pass so the
 *  real distribution is visible rather than assumed. */
export const MIN_FULFILLMENT_AGE_MS = 3000;

export type ShippingNoticeDecision =
  | "notify"
  | "skipped_disabled_env"
  | "skipped_disabled_merchant"
  | "skipped_already_notified_by_us"
  | "skipped_already_sent_by_shopify"
  | "skipped_fulfillment_too_young"
  | "skipped_no_order_id"
  | "skipped_no_fulfillment_created_at"
  | "skipped_timeline_unreadable";

export interface ShippingNoticeVerdict {
  decision: ShippingNoticeDecision;
  /** True only for "notify" — the single boolean the mutation needs. */
  notifyCustomer: boolean;
  /** Plain words, for the log and for any caller that reports refusals. */
  detail: string;
  /** Every mail Shopify already sent about this shipment, newest first, as
   *  `"<template name> @ <iso>"`. Empty when none. The expansion list. */
  mailAlreadySent: string[];
  /** Measured age of the fulfillment at decision time, in ms. */
  fulfillmentAgeMs: number | null;
}

const GUARD_QUERY = `#graphql
  query InkShippingNoticeGuard($orderId: ID!) {
    order(id: $orderId) {
      id
      name
      metafield(namespace: "${NAMESPACE}", key: "${NOTICE_KEY}") { value }
      events(first: 40, sortKey: CREATED_AT, reverse: true) {
        nodes {
          id
          createdAt
          ... on BasicEvent {
            action
            arguments
          }
        }
      }
    }
  }
`;

const STAMP_MUTATION = `#graphql
  mutation InkShippingNoticeStamp($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      userErrors { field message }
    }
  }
`;

/** Whatever a thrown value was, said in words. */
function asMessage(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/** The template name Shopify put in the event, or a readable stand-in. The
 *  first argument of a `mail_sent` event is the message type; everything after
 *  it is recipient and delivery detail we deliberately do not log (PII). */
function mailTemplateName(args: unknown): string {
  if (Array.isArray(args) && args.length > 0 && typeof args[0] === "string") {
    return args[0];
  }
  return "(unnamed email)";
}

/** Default ON (Sam's ruling is the default); only an explicit `false` turns one
 *  merchant off, and the env kills it everywhere. The rule itself lives with
 *  the other two switches, so "absent means on" cannot drift between the
 *  screen that shows it and the webhook that obeys it. */
export { shippingNoticeEnabled } from "./tracking-card-switches";

/**
 * Should Shopify send its shipping email for this fulfillment — the one that
 * will carry the brand's page, because our URL is on the fulfillment by the
 * time it composes?
 *
 * Never throws: a webhook's only unforgivable outcome is a non-200.
 */
export async function decideShopifyShippingNotice({
  admin,
  shop,
  orderGid,
  fulfillmentPayload,
  merchantData,
  now = Date.now(),
  label = "shipping-notice",
}: {
  admin: GraphqlAdmin;
  shop: string;
  orderGid: string | null | undefined;
  /** The Fulfillment webhook payload — `id` and `created_at` are what matter. */
  fulfillmentPayload: Loose | null | undefined;
  merchantData: Loose;
  now?: number;
  label?: string;
}): Promise<ShippingNoticeVerdict> {
  const no = (
    decision: ShippingNoticeDecision,
    detail: string,
    extra: Partial<ShippingNoticeVerdict> = {},
  ): ShippingNoticeVerdict => ({
    decision,
    notifyCustomer: false,
    detail,
    mailAlreadySent: [],
    fulfillmentAgeMs: null,
    ...extra,
  });

  if (process.env.SHOPIFY_SHIPPING_EMAIL_DISABLED) {
    console.log(`📨 ${label}: OFF by env — Shopify sends nothing on our account.`);
    return no("skipped_disabled_env", "turned off everywhere by the env kill switch");
  }
  if (merchantData?.shopify_shipping_email === false) {
    console.log(`📨 ${label}: OFF for ${shop} — the merchant turned this off.`);
    return no("skipped_disabled_merchant", "this shop turned the setting off");
  }
  if (!orderGid) {
    console.warn(`📨 ${label}: no order id on the fulfillment — cannot read the timeline.`);
    return no("skipped_no_order_id", "the fulfillment named no order");
  }

  const createdAtRaw = fulfillmentPayload?.created_at;
  const createdAtMs = createdAtRaw ? Date.parse(String(createdAtRaw)) : NaN;
  if (!Number.isFinite(createdAtMs)) {
    console.warn(`📨 ${label}: fulfillment carries no readable created_at — refusing to guess.`);
    return no("skipped_no_fulfillment_created_at", "the fulfillment carries no creation time");
  }
  const ageMs = now - createdAtMs;

  // A fulfillment younger than the margin cannot yet prove Shopify sent
  // nothing: the mail event lands about a second after fulfillment and this
  // read could win the race. Silence is the safe side of that coin.
  if (ageMs < MIN_FULFILLMENT_AGE_MS) {
    console.log(
      `📨 ${label}: fulfillment is ${ageMs}ms old (< ${MIN_FULFILLMENT_AGE_MS}ms) — too early to know ` +
        `whether Shopify already emailed; leaving it to Shopify's own notification.`,
    );
    return no("skipped_fulfillment_too_young", "checked too soon after fulfillment to be sure", {
      fulfillmentAgeMs: ageMs,
    });
  }

  let order: Loose | null = null;
  try {
    const res = await admin.graphql(GUARD_QUERY, { variables: { orderId: orderGid } });
    const json = (await res.json()) as Loose;
    const topErrors = Array.isArray(json?.errors) ? (json.errors as Loose[]) : [];
    if (topErrors.length > 0) {
      const detail = topErrors.map((e) => String(e?.message ?? e)).join("; ");
      console.warn(`📨 ${label}: Shopify would not read the timeline — ${detail}`);
      return no("skipped_timeline_unreadable", `Shopify refused the timeline read: ${detail}`, {
        fulfillmentAgeMs: ageMs,
      });
    }
    order = ((json?.data as Loose | undefined)?.order as Loose | undefined) ?? null;
  } catch (e) {
    console.warn(`📨 ${label}: timeline read threw (non-fatal) — ${asMessage(e)}`);
    return no("skipped_timeline_unreadable", `the timeline read failed: ${asMessage(e)}`, {
      fulfillmentAgeMs: ageMs,
    });
  }

  const eventNodes = ((order?.events as Loose | undefined)?.nodes as Loose[] | undefined) ?? null;
  if (!order || !Array.isArray(eventNodes)) {
    console.warn(`📨 ${label}: no timeline for ${orderGid} — refusing to notify on an unknown history.`);
    return no("skipped_timeline_unreadable", "the order's timeline came back empty", {
      fulfillmentAgeMs: ageMs,
    });
  }

  // OUR OWN STAMP FIRST — one notice per order, ever, even if Shopify's
  // timeline read is generous and even across webhook redeliveries.
  const stamped = (order?.metafield as Loose | undefined)?.value;
  if (stamped) {
    console.log(`📨 ${label}: ${String(order.name ?? orderGid)} already has our notice (${String(stamped)}) — never twice.`);
    return no("skipped_already_notified_by_us", `we already asked Shopify to email this order (${String(stamped)})`, {
      fulfillmentAgeMs: ageMs,
    });
  }

  // THE MEASUREMENT. Any customer email Shopify recorded at or after this
  // fulfillment was born is an email about this shipment.
  const mailAlreadySent: string[] = [];
  for (const node of eventNodes) {
    if (node?.action !== "mail_sent") continue;
    const at = Date.parse(String(node?.createdAt ?? ""));
    if (!Number.isFinite(at) || at < createdAtMs) continue;
    mailAlreadySent.push(`${mailTemplateName(node.arguments)} @ ${String(node.createdAt)}`);
  }

  if (mailAlreadySent.length > 0) {
    // NO SILENT CAPS: the template names are the expansion list, exactly as the
    // carrier names are for the branded link.
    console.log(
      `📨 ${label}: Shopify already emailed this buyer about ${String(order.name ?? orderGid)} ` +
        `[${mailAlreadySent.join(" | ")}] — never a second shipping email from us. ` +
        `(fulfillment age ${ageMs}ms)`,
    );
    return no(
      "skipped_already_sent_by_shopify",
      `Shopify already sent ${mailAlreadySent.length} email(s) for this shipment`,
      { mailAlreadySent, fulfillmentAgeMs: ageMs },
    );
  }

  console.log(
    `📨 ${label}: no customer email exists for ${String(order.name ?? orderGid)} since the fulfillment ` +
      `(age ${ageMs}ms) — asking Shopify to send ONE shipping update, carrying the brand's page.`,
  );
  return {
    decision: "notify",
    notifyCustomer: true,
    detail: "no shipping email exists for this fulfillment yet",
    mailAlreadySent: [],
    fulfillmentAgeMs: ageMs,
  };
}

/**
 * Record that we asked Shopify to email this order. Written only AFTER the
 * notifying mutation succeeded, so a failed ask stays retryable — the same
 * order the state emails use for their sent-stamps.
 *
 * Never throws. A lost stamp is a possible duplicate on a webhook redelivery,
 * which is worth a warning and never worth a non-200.
 */
export async function stampShippingNotice({
  admin,
  orderGid,
  fulfillmentId,
  label = "shipping-notice",
}: {
  admin: GraphqlAdmin;
  orderGid: string;
  fulfillmentId: string;
  label?: string;
}): Promise<boolean> {
  try {
    const res = await admin.graphql(STAMP_MUTATION, {
      variables: {
        metafields: [
          {
            ownerId: orderGid,
            namespace: NAMESPACE,
            key: NOTICE_KEY,
            type: "single_line_text_field",
            value: `${fulfillmentId}@${new Date().toISOString()}`,
          },
        ],
      },
    });
    const json = (await res.json()) as Loose;
    const set = (json?.data as Loose | undefined)?.metafieldsSet as Loose | undefined;
    const errors = (set?.userErrors as Loose[] | undefined) ?? [];
    if (errors.length > 0) {
      console.warn(
        `📨 ${label}: Shopify emailed the buyer but the stamp failed — a redelivery could repeat it: ` +
          errors.map((e) => String(e?.message ?? e)).join("; "),
      );
      return false;
    }
    return true;
  } catch (e) {
    console.warn(`📨 ${label}: stamp threw (non-fatal) — ${asMessage(e)}`);
    return false;
  }
}
