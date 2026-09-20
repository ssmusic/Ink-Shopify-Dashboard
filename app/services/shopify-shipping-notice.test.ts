// THE DECISION: does Shopify still owe this buyer a shipping email?
//
// Every test here names the bad outcome it prevents. Two of them are the whole
// point of the module: a buyer who already had a shipping email must never get
// a second, and a buyer who had none must get the one that carries the page.
//
// THE FIXTURE IS REAL. The timeline below is Steve Madden order #1027, read off
// Shopify on 2026-09-05 — the fulfilment at 01:59:28Z, the shipping
// confirmation one second later, our own rewrite six seconds after that. If
// Shopify ever changes the shape of a `mail_sent` event, these go red against
// the shape that actually shipped rather than one somebody imagined.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  decideShopifyShippingNotice,
  stampShippingNotice,
  shippingNoticeEnabled,
  MIN_FULFILLMENT_AGE_MS,
  NOTICE_KEY,
} from "./shopify-shipping-notice.server";

const FULFILLED_AT = "2026-09-05T01:59:28Z";
const ORDER_GID = "gid://shopify/Order/7658201874670";

/** Verbatim from the store, minus the buyer's address. */
const SHIPPING_CONFIRMATION = {
  id: "gid://shopify/BasicEvent/177427766313100",
  __typename: "BasicEvent",
  createdAt: "2026-09-05T01:59:29Z",
  action: "mail_sent",
  arguments: ["Shipping confirmation", "buyer@example.com", "api_client_id", 1830279],
  message: "SM Test Admin sent a shipping confirmation email to a customer.",
};
const ORDER_CONFIRMATION = {
  id: "gid://shopify/BasicEvent/177427766313101",
  __typename: "BasicEvent",
  // Seven hours BEFORE the fulfilment — the event that must never be mistaken
  // for a shipping email, and the reason this matches on time not on words.
  createdAt: "2026-09-04T18:56:54Z",
  action: "mail_sent",
  arguments: ["Order Confirmation", "buyer@example.com"],
  message: "Order confirmation email was sent to a customer.",
};
const FULFILLMENT_SUCCESS = {
  id: "gid://shopify/BasicEvent/177427766313102",
  __typename: "BasicEvent",
  createdAt: "2026-09-05T01:59:29Z",
  action: "fulfillment_success",
  arguments: [6983263912174, 1],
  message: "SM Test Admin marked 1 item as fulfilled from Shop location.",
};

type Loose = Record<string, unknown>;

function fakeAdmin({
  events = [] as Loose[],
  metafield = null as string | null,
  errors = null as Loose[] | null,
  throwWith = "",
}) {
  const calls: Array<{ query: string; variables?: Loose }> = [];
  return {
    calls,
    graphql: vi.fn(async (query: string, opts?: { variables?: Loose }) => {
      calls.push({ query, variables: opts?.variables });
      if (throwWith) throw new Error(throwWith);
      if (query.includes("InkShippingNoticeStamp")) {
        return { json: async () => ({ data: { metafieldsSet: { userErrors: [] } } }) } as unknown as Response;
      }
      if (errors) return { json: async () => ({ errors }) } as unknown as Response;
      return {
        json: async () => ({
          data: {
            order: {
              id: ORDER_GID,
              name: "#1027",
              metafield: metafield ? { value: metafield } : null,
              events: { nodes: events },
            },
          },
        }),
      } as unknown as Response;
    }),
  };
}

/** Well past the young-fulfilment margin, as every real webhook is. */
const NOW = Date.parse(FULFILLED_AT) + 6000;

type Overrides = Partial<Parameters<typeof decideShopifyShippingNotice>[0]>;

const decide = (over: Overrides = {}) =>
  decideShopifyShippingNotice({
    admin: fakeAdmin({}),
    shop: "sm-test-hhawzn52.myshopify.com",
    orderGid: ORDER_GID,
    fulfillmentPayload: { id: 6983263912174, created_at: FULFILLED_AT },
    merchantData: {},
    now: NOW,
    ...over,
  });

beforeEach(() => {
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "warn").mockImplementation(() => {});
  delete process.env.SHOPIFY_SHIPPING_EMAIL_DISABLED;
});
afterEach(() => {
  vi.restoreAllMocks();
  delete process.env.SHOPIFY_SHIPPING_EMAIL_DISABLED;
});

describe("the buyer who already had a shipping email", () => {
  it("is NEVER emailed again — rule 4, in the half it always meant", async () => {
    const admin = fakeAdmin({ events: [SHIPPING_CONFIRMATION, FULFILLMENT_SUCCESS, ORDER_CONFIRMATION] });
    const out = await decide({ admin });
    expect(out.decision).toBe("skipped_already_sent_by_shopify");
    expect(out.notifyCustomer).toBe(false);
  });

  it("names what Shopify sent, so the real template names accumulate in the log", async () => {
    const admin = fakeAdmin({ events: [SHIPPING_CONFIRMATION] });
    const out = await decide({ admin });
    expect(out.mailAlreadySent).toEqual([`Shipping confirmation @ ${SHIPPING_CONFIRMATION.createdAt}`]);
  });

  it("counts ANY email sent since the fulfilment, whatever it is called — the fence must hold in every language", async () => {
    const localized = { ...SHIPPING_CONFIRMATION, arguments: ["Confirmation d’expédition", "buyer@example.com"] };
    const out = await decide({ admin: fakeAdmin({ events: [localized] }) });
    expect(out.decision).toBe("skipped_already_sent_by_shopify");
  });
});

describe("the buyer who had nothing", () => {
  it("gets the one email that carries the page", async () => {
    const admin = fakeAdmin({ events: [FULFILLMENT_SUCCESS, ORDER_CONFIRMATION] });
    const out = await decide({ admin });
    expect(out.decision).toBe("notify");
    expect(out.notifyCustomer).toBe(true);
    expect(out.mailAlreadySent).toEqual([]);
  });

  it("an order confirmation from hours earlier does NOT count as a shipping email", async () => {
    // The whole reason the match is on time and not on the template's name:
    // every order has an order confirmation, and a name check that got this
    // wrong would silently turn the feature off for every merchant.
    const out = await decide({ admin: fakeAdmin({ events: [ORDER_CONFIRMATION] }) });
    expect(out.decision).toBe("notify");
  });

  it("reads the timeline exactly once, with the order it was given", async () => {
    const admin = fakeAdmin({ events: [] });
    await decide({ admin });
    expect(admin.graphql).toHaveBeenCalledOnce();
    expect(admin.calls[0].variables).toEqual({ orderId: ORDER_GID });
  });
});

describe("the switches", () => {
  it("the env kill switch turns it off everywhere and reads nothing", async () => {
    process.env.SHOPIFY_SHIPPING_EMAIL_DISABLED = "1";
    const admin = fakeAdmin({ events: [] });
    const out = await decide({ admin });
    expect(out.decision).toBe("skipped_disabled_env");
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("a merchant who turned it off is left alone, and costs no API call", async () => {
    const admin = fakeAdmin({ events: [] });
    const out = await decide({ admin, merchantData: { shopify_shipping_email: false } });
    expect(out.decision).toBe("skipped_disabled_merchant");
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("DEFAULT ON: an absent field is not a refusal", () => {
    expect(shippingNoticeEnabled({})).toBe(true);
    expect(shippingNoticeEnabled(undefined)).toBe(true);
    expect(shippingNoticeEnabled({ shopify_shipping_email: true })).toBe(true);
    expect(shippingNoticeEnabled({ shopify_shipping_email: false })).toBe(false);
  });
});

describe("every uncertainty resolves to silence", () => {
  it("our own stamp stops a second ask, even across a webhook redelivery", async () => {
    const admin = fakeAdmin({ events: [], metafield: "6983263912174@2026-09-05T02:00:00.000Z" });
    const out = await decide({ admin });
    expect(out.decision).toBe("skipped_already_notified_by_us");
    expect(out.notifyCustomer).toBe(false);
  });

  it("a fulfilment younger than the margin is too early to know", async () => {
    const out = await decide({ now: Date.parse(FULFILLED_AT) + MIN_FULFILLMENT_AGE_MS - 1 });
    expect(out.decision).toBe("skipped_fulfillment_too_young");
    expect(out.fulfillmentAgeMs).toBe(MIN_FULFILLMENT_AGE_MS - 1);
  });

  it("a timeline Shopify refused to read is never read as 'nothing was sent'", async () => {
    const admin = fakeAdmin({ errors: [{ message: "Access denied for events field" }] });
    const out = await decide({ admin });
    expect(out.decision).toBe("skipped_timeline_unreadable");
    expect(out.detail).toContain("Access denied");
  });

  it("a timeline read that threw is not a clean history either", async () => {
    const out = await decide({ admin: fakeAdmin({ throwWith: "network down" }) });
    expect(out.decision).toBe("skipped_timeline_unreadable");
    expect(out.notifyCustomer).toBe(false);
  });

  it("a fulfilment with no creation time is refused rather than guessed", async () => {
    const out = await decide({ fulfillmentPayload: { id: 1 } });
    expect(out.decision).toBe("skipped_no_fulfillment_created_at");
  });

  it("a fulfilment naming no order is refused", async () => {
    const out = await decide({ orderGid: null });
    expect(out.decision).toBe("skipped_no_order_id");
  });

  it("never throws, whatever happens", async () => {
    await expect(decide({ admin: fakeAdmin({ throwWith: "boom" }) })).resolves.toBeTruthy();
  });
});

describe("the stamp", () => {
  it("writes the fulfilment it notified for, on the order", async () => {
    const admin = fakeAdmin({});
    const ok = await stampShippingNotice({ admin, orderGid: ORDER_GID, fulfillmentId: "998" });
    expect(ok).toBe(true);
    const mf = (admin.calls[0].variables?.metafields as Loose[])[0];
    expect(mf).toMatchObject({ ownerId: ORDER_GID, namespace: "ink", key: NOTICE_KEY });
    expect(String(mf.value)).toContain("998@");
  });

  it("a failed stamp is reported, never thrown — the webhook still 200s", async () => {
    const admin = { graphql: vi.fn(async () => { throw new Error("nope"); }) };
    await expect(stampShippingNotice({ admin, orderGid: ORDER_GID, fulfillmentId: "1" })).resolves.toBe(false);
  });
});
