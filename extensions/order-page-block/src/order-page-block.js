// THE BLOCK ON THE ORDER STATUS PAGE — where the email's primary button lands.
//
// The buyer clicked "View your order" in Shopify's own email. This block is
// standing on the page that button opens, holding the one link the email
// itself could not carry: {brand}.in.ink/o/{order_number}, which 302s to the
// buyer's page.
//
// WHY IT COMPOSES THE DOOR INSTEAD OF READING THE PAGE'S OWN ADDRESS.
// The exact address — https://{brand}.in.ink/r/{token} — is stamped on the
// ORDER at enrol as `ink.page_url` (page-url-on-the-order.server.ts), and
// reading it here would spare the redirect and the order-number match. It
// cannot be read. Measured against shopify.dev on 2026-09-05, three walls,
// any one of them fatal:
//
//   1. NO ORDER OWNER. `appMetafields` is the only metafields property this
//      target has on api_version 2026-07, and `AppMetafieldEntryTarget.type`
//      is customer · product · shop · shopUser · variant · company ·
//      companyLocation · cart. There is no `order`.
//      (customer-account-ui-extensions/2026-07/target-apis/order-apis/
//      metafields-api)
//   2. THE ORDER-METAFIELD ACCESSOR IS GONE. 2025-10 documented a second
//      root property, `metafields` — "The metafields associated with the
//      order." 2026-07 documents `appMetafields` and nothing else.
//   3. AN UNRESERVED NAMESPACE IS HIDDEN ANYWAY. `ink` is merchant-owned, so
//      its Customer Account API access is "Hidden from Customer Accounts API
//      (default)" and "can only be configured through the Shopify admin"
//      (apps/custom-data/metafields/definitions/access-controls). No app-side
//      mutation can grant it — a merchant would have to switch it on by hand,
//      per store, which is the Liquid paste wearing a different hat.
//
// So the shop's door is not a fallback here. It is the mechanism: one
// metafield on the SHOP (`shop` IS an appMetafields owner), the order number
// the page already knows, zero merchant work, every store. `ink.page_url`
// stays on the order for Shopify's own notification templates, which read it
// in Liquid where none of the three walls apply.
//
// TWO REFUSALS, both load-bearing:
//
//  1. NO DOOR, NO SURFACE. The link is built ONLY from the `ink:order_door`
//     shop metafield the embed wrote for this exact brand. If the metafield
//     is absent, empty, or not an https .in.ink door, this module renders
//     NOTHING — no fallback host, no derived-from-shop-domain guess (the
//     Clare-V law; a wrong-but-plausible host is how sm-test-hhawzn52.in.ink
//     happened). Absence is also the app's per-store OFF switch.
//  2. NO NETWORK. The block computes its link from what the page already
//     knows (metafield + order number). It fetches nothing, so it can never
//     slow the page, leak an order, or need the network_access capability.
//
// The order number arrives as `order.name` ("#1023"); the door compares on
// digits alone (worker order-door law), so digits are what we append.

export const DOOR_NAMESPACE = "ink";
export const DOOR_KEY = "order_door";

/** The only shape of door this block will send a buyer to: the brand's own
 *  host, path exactly /o/. Deliberately narrow — no query, no fragment, no
 *  userinfo, no port, no uppercase host. */
const DOOR_BASE_GATE = /^https:\/\/[a-z0-9][a-z0-9-]*\.in\.ink\/o\/$/;

/** True only for a door base of the shape the embed's writer produces. */
export function isOrderDoorBase(value) {
  return DOOR_BASE_GATE.test(String(value || "").trim());
}

/** Unwrap a runtime signal (`{value}`) or take a plain array as it comes.
 *  appMetafields arrives as a signal that may fill after first paint;
 *  reading both shapes means neither can silently blank the block. */
function listOf(source) {
  if (!source) return [];
  const raw = Array.isArray(source) ? source : source.value;
  return Array.isArray(raw) ? raw : [];
}

/** The door base from OUR declared shop metafield, or null. Only the shop's
 *  own entry counts: an app metafield on any other owner is not this brand's
 *  door. */
export function doorBaseFromAppMetafields(appMetafields) {
  for (const entry of listOf(appMetafields)) {
    const m = entry && entry.metafield;
    const target = entry && entry.target;
    if (!m || m.key !== DOOR_KEY) continue;
    if (target && target.type && target.type !== "shop") continue;
    const base = String(m.value || "").trim();
    if (isOrderDoorBase(base)) return base;
  }
  return null;
}

/** "#1023" → "1023". The door compares on digits alone. */
export function orderDigitsFromName(name) {
  return String(name || "").replace(/\D/g, "");
}

/** The one link this block will render, or null for no surface at all. */
export function linkForOrder({ appMetafields, orderName } = {}) {
  const base = doorBaseFromAppMetafields(appMetafields);
  const digits = orderDigitsFromName(orderName);
  if (!base || !digits) return null; // no door, no surface
  return base + digits;
}

export default async () => {
  const root = document.body;

  const render = () => {
    const order = shopify.order && shopify.order.value;
    const link = linkForOrder({
      appMetafields: shopify.appMetafields,
      orderName: order && order.name,
    });
    root.replaceChildren();
    if (!link) return; // no door, no surface

    const stack = document.createElement("s-stack");
    stack.setAttribute("gap", "base");

    const heading = document.createElement("s-heading");
    heading.textContent = "Your order page";

    // PLACEHOLDER COPY, AWAITING SAM. Three lines a buyer reads, written to
    // the law and no further: no possessive cushioning past the heading, no
    // copy that reassures or explains itself, and no promise of a feature a
    // given store may not have on (an earlier draft said "returns", which is
    // false for any merchant without them configured). BRAND_BIBLE §5/§6.
    const line = document.createElement("s-text");
    line.textContent = "Delivery updates and help for this order.";

    const button = document.createElement("s-button");
    button.setAttribute("href", link);
    button.setAttribute("variant", "primary");
    button.textContent = "Open the page";

    stack.append(heading, line, button);
    root.append(stack);
  };

  // Signals may fill after first paint; re-render on either arriving late.
  if (shopify.appMetafields && shopify.appMetafields.subscribe) {
    shopify.appMetafields.subscribe(render);
  }
  if (shopify.order && shopify.order.subscribe) {
    shopify.order.subscribe(render);
  }
  render();
};
