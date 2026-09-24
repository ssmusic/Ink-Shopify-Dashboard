// THE OUTBOX CANARY — the promise that Shopify's own emails carry the brand.
//
// WHY THIS FILE IS THE FIRST TEST IN THE REPO. Until now this repo had NO
// test runner: typecheck, build and lint were the only gates. All three can
// be green while `fulfillmentTrackingInfoUpdate` is never called, called with
// a malformed input Shopify rejects, or called on a fulfillment whose carrier
// feed is dead — and the only way anyone would find out is a buyer clicking
// "track your shipment" and landing somewhere wrong. The sibling repo learned
// this the expensive way on 2026-07-20: a correct change turned the product
// off for seventeen days behind green gates, because every gate asked about
// code shape and none asked whether the promise still held.
//
// WHAT IT GUARDS. `assertBrandedTrackingUrl` is the whole auto-link decision:
// four refusals that are each load-bearing, plus one mutation whose shape
// Shopify's schema is strict about. Every branch is exercised here against an
// injected `admin.graphql`, so this runs with no Shopify login, no network and
// no store — which is exactly why it can run on every push.
//
// WHAT IT CANNOT GUARD, stated plainly so nobody mistakes green for proof:
// this tests that we ASK Shopify correctly. It cannot tell you the URL landed
// in a real buyer's inbox — that needs a real fulfillment on a real store
// (Clare V / Steve Madden, `SHIPPO_TRANSIT` in test mode). Unit-green plus a
// live staged fulfillment is the pair; neither alone is the promise.

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { assertBrandedTrackingUrl, isBrandedTrackingUrl } from "./branded-tracking-link.server";

const otherAppHoldsSession = vi.fn(async (_shop: string) => false);
vi.mock("../firestore-session-storage.server", () => ({ otherAppHoldsSession }));

vi.mock("./brand-page-url.server", () => ({
  resolveBrandPageUrl: vi.fn(async () => ({
    pageUrl: "https://clarev.in.ink/r/nfc_test_token",
    nfcToken: "nfc_test_token",
    brandSlug: "clarev",
  })),
}));

/** A fake Shopify admin that records what we asked it, and answers how the
 *  real one does. The recording IS the assertion for the mutation shape. */
function fakeAdmin(response: unknown = { data: { fulfillmentTrackingInfoUpdate: { userErrors: [] } } }) {
  const calls: Array<{ query: string; variables: Record<string, unknown> }> = [];
  return {
    calls,
    graphql: vi.fn(async (query: string, opts?: { variables?: Record<string, unknown> }) => {
      calls.push({ query, variables: opts?.variables ?? {} });
      return { json: async () => response } as unknown as Response;
    }),
  };
}

const FULFILLMENT = {
  id: 998877,
  tracking_company: "UPS",
  tracking_number: "1Z999AA10123456784",
};

const base = () => ({
  shop: "clarev-test.myshopify.com",
  payload: { ...FULFILLMENT },
  proofId: "proof_abc",
  merchantApiKey: "key",
  merchantData: {} as Record<string, unknown>,
  shippoRegistered: true,
});

let logs: string[] = [];
beforeEach(() => {
  logs = [];
  vi.spyOn(console, "log").mockImplementation((...a) => void logs.push(a.join(" ")));
  vi.spyOn(console, "warn").mockImplementation((...a) => void logs.push(a.join(" ")));
  vi.spyOn(console, "error").mockImplementation((...a) => void logs.push(a.join(" ")));
  delete process.env.BRANDED_TRACKING_LINK_DISABLED;
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  delete process.env.BRANDED_TRACKING_LINK_DISABLED;
});

describe("the outbox canary — the happy path actually rewrites the link", () => {
  it("points Shopify's tracking URL at the brand page and says so", async () => {
    const admin = fakeAdmin();
    const result = await assertBrandedTrackingUrl({ admin, ...base() });

    expect(result.outcome).toBe("updated");
    expect(result.url).toBe("https://clarev.in.ink/r/nfc_test_token");
    expect(admin.graphql).toHaveBeenCalledOnce();
  });

  it("sends the exact input shape Shopify's schema demands", async () => {
    const admin = fakeAdmin();
    await assertBrandedTrackingUrl({ admin, ...base() });
    const { variables } = admin.calls[0];

    // The gid form — a bare numeric id is rejected by the mutation.
    expect(variables.fulfillmentId).toBe("gid://shopify/Fulfillment/998877");

    const input = variables.trackingInfoInput as Record<string, unknown>;
    // THE SCHEMA'S OWN RULE: `url` pairs with `number`, `urls` with `numbers`,
    // and the two forms are never mixed. Mixing them is a malformed write.
    expect(input.number).toBe("1Z999AA10123456784");
    expect(input.url).toBe("https://clarev.in.ink/r/nfc_test_token");
    expect(input.numbers).toBeUndefined();
    expect(input.urls).toBeUndefined();
    // THE CARRIER IS PRESERVED. We are not hiding the carrier, we are
    // answering its question better — the number and company stay visible.
    expect(input.company).toBe("UPS");

    // NO SILENT NOTIFICATION: rewriting a link must never re-send a shipping
    // email to a buyer who already got one.
    expect(variables.notifyCustomer).toBe(false);
  });

  it("a multi-parcel fulfillment uses the plural form, one page per number", async () => {
    const admin = fakeAdmin();
    await assertBrandedTrackingUrl({
      admin,
      ...base(),
      payload: { ...FULFILLMENT, tracking_number: undefined, tracking_numbers: ["A1", "B2"] },
    });
    const input = admin.calls[0].variables.trackingInfoInput as Record<string, unknown>;

    expect(input.numbers).toEqual(["A1", "B2"]);
    expect(input.urls).toEqual([
      "https://clarev.in.ink/r/nfc_test_token",
      "https://clarev.in.ink/r/nfc_test_token",
    ]);
    expect(input.number).toBeUndefined();
    expect(input.url).toBeUndefined();
  });
});

describe("the outbox canary — every refusal holds, and none of them writes", () => {
  const refuses = async (over: Record<string, unknown>, expected: string) => {
    const admin = fakeAdmin();
    const result = await assertBrandedTrackingUrl({ admin, ...base(), ...over });
    expect(result.outcome).toBe(expected);
    // The whole point of a refusal is that Shopify is left alone.
    expect(admin.graphql).not.toHaveBeenCalled();
    return result;
  };

  it("the env kill switch turns it off everywhere", async () => {
    process.env.BRANDED_TRACKING_LINK_DISABLED = "1";
    await refuses({}, "skipped_disabled_env");
  });

  it("a merchant who switched it off keeps Shopify's link", async () => {
    await refuses({ merchantData: { branded_tracking_link: false } }, "skipped_disabled_merchant");
  });

  it("THE LOOP GUARD: our own mutation's echo is a no-op", async () => {
    // Our rewrite re-fires FULFILLMENTS_UPDATE. Without this the webhook
    // would rewrite its own rewrite, forever.
    await refuses(
      { payload: { ...FULFILLMENT, tracking_url: "https://clarev.in.ink/r/nfc_test_token" } },
      "skipped_already_branded",
    );
  });

  it("A DEAD FEED KEEPS THE CARRIER'S LINK — and names the carrier it skipped", async () => {
    // A branded page that says "on its way" forever is WORSE than the carrier
    // link: it burns the one impression this exists to win.
    const result = await refuses({ shippoRegistered: false }, "skipped_feed_unregistered");
    expect(result.detail).toBe("UPS");
    // The skip log is the expansion list for shippoCarriers.js — a silent
    // skip would make the real carrier mix invisible.
    expect(logs.join("\n")).toContain("UPS");
  });

  it("no tracking number means no rewrite — a url without a number is malformed", async () => {
    await refuses(
      { payload: { id: 998877, tracking_company: "UPS" } },
      "skipped_no_page_url",
    );
  });

  it("no fulfillment id means there is nothing to address", async () => {
    await refuses({ payload: { tracking_number: "A1", tracking_company: "UPS" } }, "skipped_no_fulfillment_id");
  });
});

describe("the outbox canary — Shopify's own failures never break the webhook", () => {
  it("userErrors are reported, not thrown", async () => {
    const admin = fakeAdmin({
      data: { fulfillmentTrackingInfoUpdate: { userErrors: [{ field: ["trackingInfoInput"], message: "invalid" }] } },
    });
    const result = await assertBrandedTrackingUrl({ admin, ...base() });
    expect(result.outcome).toBe("failed");
    expect(result.detail).toContain("invalid");
  });

  it("a thrown request is non-fatal — the webhook must still return 200", async () => {
    const admin = {
      graphql: vi.fn(async () => {
        throw new Error("network down");
      }),
    };
    const result = await assertBrandedTrackingUrl({ admin, ...base() });
    expect(result.outcome).toBe("failed");
    expect(result.detail).toContain("network down");
  });
});

describe("isBrandedTrackingUrl — the loop guard's own edges", () => {
  it("recognises our hosts and only ours", () => {
    expect(isBrandedTrackingUrl("https://clarev.in.ink/r/tok")).toBe(true);
    expect(isBrandedTrackingUrl("https://www.in.ink/r/tok")).toBe(true);
    expect(isBrandedTrackingUrl("https://in.ink")).toBe(true);
    expect(isBrandedTrackingUrl("https://ups.com/track?n=1")).toBe(false);
    expect(isBrandedTrackingUrl("")).toBe(false);
    expect(isBrandedTrackingUrl(null)).toBe(false);
    // A lookalike domain must NOT read as ours, or a hostile link would
    // silently disable the rewrite for that fulfillment.
    expect(isBrandedTrackingUrl("https://not-in.ink.example.com/x")).toBe(false);
  });
  it("under ink, checks the URL host instead of words in a carrier URL", () => {
    vi.stubEnv("APP_FLAVOR", "ink");
    expect(isBrandedTrackingUrl("https://clarev.in.ink/r/tok")).toBe(true);
    expect(isBrandedTrackingUrl("https://carrier.example/track?next=https://www.in.ink/r/tok")).toBe(false);
    expect(isBrandedTrackingUrl("https://www.in.ink.attacker.example/r/tok")).toBe(false);
    expect(isBrandedTrackingUrl("http://clarev.in.ink/r/tok")).toBe(false);
    expect(isBrandedTrackingUrl("https://ink:secret@clarev.in.ink/r/tok")).toBe(false);
  });
});

// UNDER INK, THE FEED GATE HOLDS ONLY WHERE THE RITUALIST'S PAGE MAY BE THE
// BUYER'S (2026-09-24, the App Store review). ink's own page shows no
// tracking status, so on a store without the Ritualist a dead or absent feed
// cannot make it lie — and a reviewer's made-up number, or a carrier the feed
// cannot follow, must still get ink's link: the listing says every one.
describe("under ink, the link does not wait for the carrier feed on a store ink alone serves", () => {
  beforeEach(() => {
    vi.stubEnv("APP_FLAVOR", "ink");
    otherAppHoldsSession.mockReset();
  });

  it("rewrites the link with the feed unregistered when the Ritualist is not installed", async () => {
    otherAppHoldsSession.mockResolvedValue(false);
    const admin = fakeAdmin();
    const result = await assertBrandedTrackingUrl({ admin, ...base(), shippoRegistered: false });
    expect(result.outcome).toBe("updated");
    expect(admin.graphql).toHaveBeenCalledOnce();
    expect(otherAppHoldsSession).toHaveBeenCalledWith("clarev-test.myshopify.com");
  });

  it("leaves the link to the Ritualist when the Ritualist is installed on the same store", async () => {
    otherAppHoldsSession.mockResolvedValue(true);
    const admin = fakeAdmin();
    const result = await assertBrandedTrackingUrl({ admin, ...base(), shippoRegistered: false });
    expect(result.outcome).toBe("skipped_ritualist_installed");
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("keeps the carrier's link when the session store cannot answer", async () => {
    otherAppHoldsSession.mockRejectedValue(new Error("firestore unavailable"));
    const admin = fakeAdmin();
    const result = await assertBrandedTrackingUrl({ admin, ...base(), shippoRegistered: false });
    expect(result.outcome).toBe("skipped_feed_unregistered");
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("rewrites with a registered feed when ink alone serves the store, asking the sessions once", async () => {
    otherAppHoldsSession.mockResolvedValue(false);
    const admin = fakeAdmin();
    const result = await assertBrandedTrackingUrl({ admin, ...base(), shippoRegistered: true });
    expect(result.outcome).toBe("updated");
    expect(otherAppHoldsSession).toHaveBeenCalledTimes(1);
  });

  // THE OVERWRITE (Steve Madden #1029, 2026-09-24): with a registered feed both
  // apps rewrote, and ink's www.in.ink link replaced the Ritualist's page.
  it("never overwrites the Ritualist's link, even with a registered feed", async () => {
    otherAppHoldsSession.mockResolvedValue(true);
    const admin = fakeAdmin();
    const result = await assertBrandedTrackingUrl({ admin, ...base(), shippoRegistered: true });
    expect(result.outcome).toBe("skipped_ritualist_installed");
    expect(admin.graphql).not.toHaveBeenCalled();
  });

  it("a session store that cannot answer keeps today's behaviour with a registered feed", async () => {
    otherAppHoldsSession.mockRejectedValue(new Error("firestore unavailable"));
    const admin = fakeAdmin();
    const result = await assertBrandedTrackingUrl({ admin, ...base(), shippoRegistered: true });
    expect(result.outcome).toBe("updated");
  });
});

describe("the Ritualist's gate is unchanged", () => {
  it("never consults the other app's sessions, and skips a dead feed", async () => {
    otherAppHoldsSession.mockReset();
    const admin = fakeAdmin();
    const result = await assertBrandedTrackingUrl({ admin, ...base(), shippoRegistered: false });
    expect(result.outcome).toBe("skipped_feed_unregistered");
    expect(otherAppHoldsSession).not.toHaveBeenCalled();
  });
});
