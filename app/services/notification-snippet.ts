// THE ONE LINE A MERCHANT PASTES — third version, and the first one that has
// been tapped by a human and worked.
//
// Shopify has no API for editing a notification template, so this line is the
// only way a store's own emails can point at the brand's page. That part is
// unavoidable. What took three attempts was WHAT the line reads.
//
// ATTEMPT 1 — `fulfillment.tracking_url`. Only ours after the branded-tracking
// rewrite runs, and that runs when we RECEIVE the fulfillment webhook — after
// Shopify has already composed the shipping email. Measured on real order
// #1020, 2026-08-10:
//     02:29:33.755  fulfillment created  → Shopify composes + queues the email
//     02:29:34.387  our rewrite lands    → tracking_url finally points at us
// ~600ms too late, by construction. And blank forever on order confirmation,
// where no fulfillment exists yet.
//
// ATTEMPT 2 — `order.metafields.ink.ink_token`. Written at enrollment, which
// felt early enough. It is not. Measured on real order #1021:
//     06:06:36  order created  → Shopify composes the confirmation email
//     06:06:41  our enroll lands → proof, token and metafields exist
// FIVE SECONDS too late. Sam pasted this into five templates before finding
// out, which is the cost of shipping a line nobody had tapped.
//
// THE LAW UNDERNEATH BOTH FAILURES: a notification can only ever carry what
// Shopify itself knows WHILE COMPOSING. Anything of ours is younger than the
// email. So the line must carry a Shopify fact and resolve to ours LATER.
//
// ATTEMPT 3 — `order_number`, through the order door. Shopify knows the order
// number before it knows anything else; `{brand}.in.ink/o/{number}` looks the
// token up when the BUYER TAPS, by which point the proof has existed for
// minutes. Verified end-to-end on real order #1023, 2026-08-10: the email's
// "View your order" button opened the buyer's page. The door itself is
// parallelreturns #855.

/** Build the paste-once Liquid for one brand.
 *
 *  `slug` is the brand's own subdomain label, resolved through
 *  `brandSlugFromDoc` so this agrees with the tracking rewrite rather than
 *  deriving a wrong-but-plausible host from the myshopify domain.
 *
 *  No blank-guard, deliberately: `order_number` is present on every order in
 *  every template, and the door already answers a miss by redirecting to the
 *  brand's front page. A guard here would only add a shape to get wrong — and
 *  the version a human actually tapped is this one, ungated. */
export function notificationSnippet(slug?: string | null): string {
  const clean = String(slug || "").trim();
  const base = clean ? `https://${clean}.in.ink/o/` : "https://www.in.ink/o/";
  return `{% assign order_status_url = "${base}" | append: order_number %}`;
}

/** The templates this line belongs in, in the order a buyer meets them.
 *  Order confirmation is FIRST — it is the email every buyer gets, and the
 *  one both earlier attempts could never serve. */
export const SNIPPET_TEMPLATES = [
  "Order confirmation",
  "Shipping confirmation",
  "Shipping update",
  "Out for delivery",
  "Delivered",
] as const;

/** THE LINE'S OWN EVIDENCE (2026-09-24). The order door (/o/) is advertised by
 *  this line and nowhere else, so the Worker reports every real hit on it to
 *  the backend, which keeps `email_door` on the merchant doc
 *  (ink-backend utils/emailDoor.js). This reads it; null means nothing has
 *  arrived through the line yet. An email scanner that pre-opens links counts
 *  too, so the words say "opened", never "read". */
export interface EmailDoor {
  first_at: string;
  last_at: string;
  count: number;
  last_order_number: string | null;
}

export function emailDoorOf(merchant: unknown): EmailDoor | null {
  const raw = (merchant as Record<string, any> | null | undefined)?.email_door;
  if (!raw || typeof raw !== "object" || typeof raw.last_at !== "string") return null;
  const count = Number(raw.count);
  return {
    first_at: typeof raw.first_at === "string" ? raw.first_at : raw.last_at,
    last_at: raw.last_at,
    count: Number.isFinite(count) && count > 0 ? Math.floor(count) : 1,
    last_order_number: typeof raw.last_order_number === "string" ? raw.last_order_number : null,
  };
}

/** The status sentence both apps show under the line. PLACEHOLDER words. */
export function emailDoorSentence(door: EmailDoor | null): { working: boolean; text: string } {
  if (!door) {
    return {
      working: false,
      text: "Not yet: nobody has opened your page from this line.",
    };
  }
  const day = new Date(door.last_at).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });
  const times = door.count === 1 ? "once" : `${door.count} times`;
  return {
    working: true,
    text: `Working: your page was opened from your emails ${times}, last on ${day}.`,
  };
}

/** The test a merchant runs once, in words. PLACEHOLDER. */
export const EMAIL_LINE_TEST =
  "To check it: place a test order to your own email, fulfil it with Send shipment details on, and tap View your order in the email. It should open your page.";
