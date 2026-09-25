// THE PAGE ON THE ORDER — stamped at enrol, so the shipping email can open it.
//
// Shopify composes the shipping-confirmation email at the instant of
// fulfilment, and by then it has already filled `fulfillment.tracking_url`
// with the carrier's own link for every carrier it recognises. Our rewrite of
// that URL (branded-tracking-link.server.ts) runs on the fulfillments/update
// that follows, and it is `notifyCustomer:false` by rule 4 — never a second
// shipping email — so the ONE email the buyer gets was rendered with ups.com
// in it. Measured on Steve Madden order #1027, 2026-09-05: Shopify's record of
// the fulfilment carried our page as its tracking URL, and the email's primary
// button opened UPS. The 2026-08-07 milestone worked only because the mutation
// then sent the mail itself.
//
// So the page's address goes on the ORDER, at enrol, before any fulfilment
// exists: `ink.page_url`. Shopify's notification variable reference reads an
// order's metafields as `metafields.NAMESPACE.KEY` in email templates
// (https://help.shopify.com/en/manual/fulfillment/setup/notifications/email-variables),
// so line 1 of the Shipping confirmation / Shipping update template can point
// `order_status_url` at the page for every carrier, in the first email.
//
// THE TIMING LAW (notification-snippet.ts): a notification can only carry what
// Shopify knows WHILE COMPOSING. The enrol lands ~5 s after the order is
// created — too late for the Order confirmation email, which is why that
// template keeps the order-door line. A fulfilment is never that fast, so for
// the shipping emails a metafield written at enrol is old news by the time
// Shopify composes them. This stamp is for those two templates and no other.
//
// THREE RULES, each paid for elsewhere:
//
//  1. THE SLUG COMES FROM THE ONE AUTHOR. `merchants/{shop_id}.brand_slug` on
//     the backend doc, merged over the embed's own doc — the same resolution
//     the tracking rewrite and the order door use. brand_slug ONLY: a
//     domain-derived guess mints `sm-test-hhawzn52.in.ink`, a host that looks
//     right and 404s (#1016), and this URL becomes the primary button of a
//     buyer's email. No slug ⇒ no stamp, and the template falls back to the
//     carrier link — today's behaviour, never a dead door (the Clare-V law).
//  2. ITS OWN WIRE, ITS OWN MUTATION. metafieldsSet is atomic — "no changes
//     are persisted if an error is encountered"
//     (https://shopify.dev/docs/api/admin-graphql/2025-10/mutations/metafieldsSet)
//     — so this never rides the enrol-critical batch (proof_reference,
//     ink_token): a `url`-typed value Shopify refused would take the proof
//     reference down with it. One guard read, one write, idempotent (the same
//     value is never rewritten), and a one-time fallback to
//     `single_line_text_field` if the `url` type is refused.
//  3. NEVER FATAL. This runs on the orders/create webhook, where a non-200
//     for any reason but the enrol itself is the one unforgivable outcome.
//     Every ending is a named outcome, logged with the order name and the
//     reason and never PII; a missing scope is `skipped_scope_missing`, not
//     a throw. (Order metafields need `write_orders` — the same access as
//     mutating the order, held since the first install:
//     https://shopify.dev/docs/api/admin-graphql/2025-10/mutations/orderUpdate.)

import { brandSlugFromDomain } from "./email.server";

export const PAGE_URL_NAMESPACE = "ink";
export const PAGE_URL_KEY = "page_url";
/** Shopify's `url` type validates the scheme (https/http/mailto/sms/tel) and
 *  renders as a string in Liquid; the text type is the fallback if a store
 *  refuses it (an existing metafield of the other type, say). */
export const PAGE_URL_TYPE = "url";
export const PAGE_URL_FALLBACK_TYPE = "single_line_text_field";

/** THE LINE SAM PASTES — line 1 of the body of "Shipping confirmation" and
 *  "Shipping update" (Settings → Notifications → the template → Edit code).
 *
 *  Shopify's own variable reference reads an order's metafields as
 *  `metafields.NAMESPACE.KEY` in email templates and says the order object
 *  is not referenced by name there
 *  (https://help.shopify.com/en/manual/fulfillment/setup/notifications/email-variables);
 *  the `order.` form is kept as the second reading because it is the one most
 *  published examples use, and Liquid treats an unknown path as blank rather
 *  than an error. The old tracking_url line stays as the fallback, so an
 *  order enrolled before this deployed behaves exactly as it does today.
 *  Built from the same namespace and key the stamp writes, so the reader and
 *  the writer cannot drift apart silently. */
export const SHIPPING_TEMPLATE_LINE =
  `{% if metafields.${PAGE_URL_NAMESPACE}.${PAGE_URL_KEY} != blank %}` +
  `{% assign order_status_url = metafields.${PAGE_URL_NAMESPACE}.${PAGE_URL_KEY} %}` +
  `{% elsif order.metafields.${PAGE_URL_NAMESPACE}.${PAGE_URL_KEY} != blank %}` +
  `{% assign order_status_url = order.metafields.${PAGE_URL_NAMESPACE}.${PAGE_URL_KEY} %}` +
  `{% elsif fulfillment.tracking_url %}{% assign order_status_url = fulfillment.tracking_url %}{% endif %}`;

/** The two templates this line belongs in — and only these. Order
 *  confirmation is composed before the enrol lands (notification-snippet.ts,
 *  attempt 2) and keeps the order-door line. */
export const SHIPPING_TEMPLATES = ["Shipping confirmation", "Shipping update"] as const;

/** Every way the stamp can end, so the webhook logs the truth, not a guess. */
export type PageUrlStampOutcome =
  | "written"
  | "unchanged"
  | "skipped_no_page_url"
  | "skipped_scope_missing"
  | "failed";

export interface PageUrlStampResult {
  outcome: PageUrlStampOutcome;
  value?: string;
  /** The metafield type that landed — `url`, or the text fallback. */
  type?: string;
  detail?: string;
}

export type PageUrlSkipReason = "no_token" | "no_slug";

export interface PageUrlResolution {
  /** The buyer's page, or null with the reason it could not be named. */
  pageUrl: string | null;
  reason?: PageUrlSkipReason;
  brandSlug: string;
}

/** The one shape of Shopify admin this needs — the real `admin.graphql` and
 *  a test's fake both satisfy it. */
export interface GraphqlAdmin {
  graphql: (query: string, opts?: { variables?: Record<string, unknown> }) => Promise<Response>;
}

const GUARD_QUERY = `#graphql
  query InkPageUrlGuard($id: ID!) {
    order(id: $id) {
      id
      metafield(namespace: "ink", key: "page_url") { id value type }
    }
  }
`;

const SET_MUTATION = `#graphql
  mutation InkPageUrlSet($metafields: [MetafieldsSetInput!]!) {
    metafieldsSet(metafields: $metafields) {
      metafields { id type value }
      userErrors { field message code }
    }
  }
`;

type Loose = Record<string, unknown>;
function loose(v: unknown): Loose {
  return v && typeof v === "object" ? (v as Loose) : {};
}
function messageOf(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** The message of a top-level GraphQL error, when Shopify sent one. */
function firstGraphqlError(json: unknown): string | null {
  const errors = loose(json).errors;
  if (!Array.isArray(errors) || errors.length === 0) return null;
  const first = loose(errors[0]);
  const m = first.message ?? loose(first.extensions).code;
  return m ? String(m) : null;
}

/** Shopify's own words for a scope the app does not hold — the body form
 *  ("Access denied for metafieldsSet field. Required access: `write_orders`
 *  access scope.") and the thrown form the client library may raise. */
function isScopeRefusal(text: string | null | undefined): boolean {
  return /access denied|required access|access scope|ACCESS_DENIED/i.test(String(text || ""));
}

/** THE BUYER'S PAGE FOR ONE ENROLLED ORDER — with no proof fetch.
 *
 *  Right after an enrol the webhook already holds the two halves of the
 *  address: the token it minted (or the backend's aligned one on a replay)
 *  and the backend's `shop_id` off the enrol response. Only the brand's own
 *  subdomain label is missing, and that has one author: `brand_slug` on the
 *  backend merchant doc, merged over the embed's (brand-page-url.server.ts).
 *
 *  Fail-soft: a backend doc that cannot be read leaves the embed's own doc to
 *  answer; a doc with no brand_slug answers "no" — never a derived host. */
export async function pageUrlForEnrolledOrder({
  shopId,
  nfcToken,
  merchantData,
  readBackendMerchantDoc = defaultReadBackendMerchantDoc,
  label = "page-url",
}: {
  /** The backend's merchant identity — `shop_id` on the enrol response. */
  shopId?: string | null;
  nfcToken?: string | null;
  /** The embed's own merchant doc (the activation doc the webhook read). */
  merchantData: Record<string, unknown> | null | undefined;
  /** Injected for tests; defaults to the app's Firestore. */
  readBackendMerchantDoc?: (shopId: string) => Promise<Record<string, unknown> | null>;
  label?: string;
}): Promise<PageUrlResolution> {
  const token = String(nfcToken || "").trim();
  if (!token) return { pageUrl: null, reason: "no_token", brandSlug: "" };

  let brandDoc: Record<string, unknown> = { ...(merchantData || {}) };
  const backendId = String(shopId || "").trim();
  if (backendId) {
    try {
      const backend = await readBackendMerchantDoc(backendId);
      if (backend) brandDoc = { ...brandDoc, ...backend };
    } catch (e: unknown) {
      console.warn(
        `🔗 ${label}: backend merchant doc ${backendId} unreadable (${messageOf(e)}) — using the embed doc for the brand.`,
      );
    }
  }

  // brand_slug ONLY. `brandSlugFromDoc` would fall through to the myshopify
  // domain, and a plausible wrong host in a buyer's email is worse than the
  // carrier link the template falls back to.
  const brandSlug = brandSlugFromDomain(
    typeof brandDoc.brand_slug === "string" ? brandDoc.brand_slug : "",
  );
  if (!brandSlug) return { pageUrl: null, reason: "no_slug", brandSlug: "" };

  return { pageUrl: `https://${brandSlug}.in.ink/r/${token}`, brandSlug };
}

async function defaultReadBackendMerchantDoc(shopId: string): Promise<Record<string, unknown> | null> {
  const { default: firestore } = await import("../firestore.server");
  const snap = await firestore.collection("merchants").doc(shopId).get();
  return snap.exists ? (snap.data() as Record<string, unknown> | undefined) ?? null : null;
}

/** Stamp `ink.page_url` on one order. Idempotent, typed `url` with a text
 *  fallback, and never a throw — see the header. */
export async function stampPageUrlOnOrder({
  admin,
  orderGid,
  orderName,
  pageUrl,
  reason,
  label = "page-url",
}: {
  admin: GraphqlAdmin;
  orderGid: string;
  /** For the log line only — the order's name, never the buyer's. */
  orderName: string;
  pageUrl: string | null | undefined;
  /** Why there is no page URL, when there is none — named in the skip. */
  reason?: string | null;
  label?: string;
}): Promise<PageUrlStampResult> {
  const value = String(pageUrl || "").trim();
  if (!value) {
    console.log(
      `🔗 ${label}: ${orderName} skipped_no_page_url — ${reason || "no page URL to stamp"}; ` +
        `the shipping email falls back to the carrier link.`,
    );
    return { outcome: "skipped_no_page_url", detail: reason || undefined };
  }

  try {
    // 1 · What does the order carry right now? Same value ⇒ done, no write.
    const guardRes = await admin.graphql(GUARD_QUERY, { variables: { id: orderGid } });
    const guard: unknown = await guardRes.json();
    const guardError = firstGraphqlError(guard);
    if (guardError && isScopeRefusal(guardError)) {
      console.warn(`🔗 ${label}: ${orderName} skipped_scope_missing — ${guardError}`);
      return { outcome: "skipped_scope_missing", detail: guardError };
    }
    const current = loose(loose(loose(loose(guard).data).order).metafield);
    const currentValue = String(current.value || "");
    const currentType = typeof current.type === "string" && current.type ? current.type : undefined;
    if (currentValue === value) {
      console.log(`🔗 ${label}: ${orderName} unchanged — the order already carries ${value}`);
      return { outcome: "unchanged", value, type: currentType };
    }

    // 2 · Write. An existing metafield keeps its type (Shopify refuses a
    //     type change); a new one is `url`, falling back to text once.
    type Attempt =
      | { ok: true }
      | {
          ok: false;
          detail: string;
          scope: boolean;
          /** A userError is Shopify judging the INPUT — the only refusal the
           *  type fallback answers. A top-level GraphQL error (throttled,
           *  internal, malformed) says nothing about the type and is never
           *  retried as one. */
          userError: boolean;
        };
    const attempt = async (type: string): Promise<Attempt> => {
      const res = await admin.graphql(SET_MUTATION, {
        variables: {
          metafields: [
            { ownerId: orderGid, namespace: PAGE_URL_NAMESPACE, key: PAGE_URL_KEY, type, value },
          ],
        },
      });
      const json: unknown = await res.json();
      const graphqlError = firstGraphqlError(json);
      if (graphqlError) {
        return { ok: false, detail: graphqlError, scope: isScopeRefusal(graphqlError), userError: false };
      }
      const userErrors = loose(loose(loose(json).data).metafieldsSet).userErrors;
      if (Array.isArray(userErrors) && userErrors.length > 0) {
        const detail = userErrors
          .map((e) => {
            const u = loose(e);
            const field = Array.isArray(u.field) ? u.field.join(".") : "";
            return `${field || String(u.code || "?")}: ${String(u.message)}`;
          })
          .join("; ");
        return { ok: false, detail, scope: isScopeRefusal(detail), userError: true };
      }
      return { ok: true };
    };

    let type = currentType ?? PAGE_URL_TYPE;
    let result = await attempt(type);
    if (!result.ok && result.userError && !result.scope && type !== PAGE_URL_FALLBACK_TYPE) {
      console.warn(
        `🔗 ${label}: ${orderName} — Shopify refused type "${type}" (${result.detail}); retrying as ${PAGE_URL_FALLBACK_TYPE}.`,
      );
      type = PAGE_URL_FALLBACK_TYPE;
      result = await attempt(type);
    }
    if (!result.ok) {
      if (result.scope) {
        console.warn(`🔗 ${label}: ${orderName} skipped_scope_missing — ${result.detail}`);
        return { outcome: "skipped_scope_missing", detail: result.detail };
      }
      console.error(`🔗 ${label}: ${orderName} failed — Shopify refused the stamp: ${result.detail}`);
      return { outcome: "failed", detail: result.detail };
    }
    console.log(`✅ ${label}: ${orderName} carries its page → ${value} (${type})`);
    return { outcome: "written", value, type };
  } catch (e: unknown) {
    // Webhook discipline: a missing stamp is a carrier link in one email,
    // never a non-200. A thrown scope refusal still says its own name.
    const message = messageOf(e);
    if (isScopeRefusal(message)) {
      console.warn(`🔗 ${label}: ${orderName} skipped_scope_missing — ${message}`);
      return { outcome: "skipped_scope_missing", detail: message };
    }
    console.error(`🔗 ${label}: ${orderName} failed (non-fatal) — ${message}`);
    return { outcome: "failed", detail: message };
  }
}
