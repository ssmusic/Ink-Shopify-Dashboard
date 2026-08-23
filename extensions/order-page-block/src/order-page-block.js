// THE BLOCK ON THE ORDER STATUS PAGE — where the email's primary button lands.
//
// The buyer clicked "View your order" in Shopify's own email. This block is
// standing on the page that button opens, holding the one link the email
// itself could not carry: {brand}.in.ink/o/{order_number}.
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

const DOOR_KEY = "order_door";

/** The door base from OUR declared shop metafield, or null. Only an
 *  https://{label}.in.ink/o/ base is a door; anything else renders nothing. */
function doorBase() {
  const entries = (shopify.appMetafields && shopify.appMetafields.value) || [];
  for (const entry of entries) {
    const m = entry && entry.metafield;
    const target = entry && entry.target;
    if (!m || m.key !== DOOR_KEY) continue;
    if (target && target.type && target.type !== "shop") continue;
    const base = String(m.value || "").trim();
    if (/^https:\/\/[a-z0-9][a-z0-9-]*\.in\.ink\/o\/$/.test(base)) return base;
  }
  return null;
}

function orderDigits() {
  const order = shopify.order && shopify.order.value;
  return String((order && order.name) || "").replace(/\D/g, "");
}

export default async () => {
  const root = document.body;

  const render = () => {
    const base = doorBase();
    const digits = orderDigits();
    root.replaceChildren();
    if (!base || !digits) return; // no door, no surface

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
    button.setAttribute("href", base + digits);
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
