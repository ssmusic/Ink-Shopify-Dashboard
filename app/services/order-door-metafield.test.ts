// THE DOOR ON THE SHOP — outcome tests, each one proven against its own bug.
//
// The unit under test decides when the `ink:order_door` shop metafield is
// read, written, or torn down. The bugs these pin:
//  · resolution running on every event (the register-quota bill, #954)
//  · a domain-derived slug shipped as a buyer-facing door (#1016's host)
//  · the kill switch leaving a stale door standing
//  · a webhook path that throws
//  · the writer and the extension disagreeing about what a door looks like
import { describe, it, expect, vi, beforeEach } from "vitest";

const resolveBrandPageUrl = vi.hoisted(() => vi.fn());
vi.mock("./brand-page-url.server", () => ({ resolveBrandPageUrl }));

import { assertOrderDoorMetafield, orderDoorBase } from "./order-door-metafield.server";
// The other half of the contract, imported rather than scraped.
import {
  DOOR_KEY,
  isOrderDoorBase,
  linkForOrder,
} from "../../extensions/order-page-block/src/order-page-block.js";

/** An admin.graphql that answers the guard query and records every call. */
function fakeAdmin(opts: { current?: string | null; failWith?: string }) {
  const calls: Array<{ query: string; variables?: any }> = [];
  const admin = {
    graphql: vi.fn(async (query: string, o?: any) => {
      calls.push({ query, variables: o?.variables });
      if (opts.failWith) throw new Error(opts.failWith);
      const body = query.includes("InkOrderDoorGuard")
        ? {
            data: {
              shop: {
                id: "gid://shopify/Shop/1",
                metafield: opts.current ? { id: "gid://mf/1", value: opts.current } : null,
              },
            },
          }
        : query.includes("InkOrderDoorSet")
          ? { data: { metafieldsSet: { userErrors: [] } } }
          : { data: { metafieldsDelete: { userErrors: [] } } };
      return { json: async () => body } as unknown as Response;
    }),
  };
  return { admin, calls };
}

const BASE_ARGS = { shop: "sm-test-hhawzn52.myshopify.com", merchantApiKey: "ink_x", proofId: "proof_1" };

beforeEach(() => {
  resolveBrandPageUrl.mockReset();
});

describe("assertOrderDoorMetafield", () => {
  it("a standing door costs one read and resolves nothing", async () => {
    const { admin, calls } = fakeAdmin({ current: "https://stevemadden.in.ink/o/" });
    const out = await assertOrderDoorMetafield({ ...BASE_ARGS, admin, merchantData: {} });
    expect(out.outcome).toBe("unchanged");
    expect(calls).toHaveLength(1);
    expect(resolveBrandPageUrl).not.toHaveBeenCalled();
  });

  it("first fulfillment writes the door from the backend doc's brand_slug", async () => {
    resolveBrandPageUrl.mockResolvedValue({
      brandSlug: "stevemadden",
      brandDoc: { brand_slug: "stevemadden" },
    });
    const { admin, calls } = fakeAdmin({ current: null });
    const out = await assertOrderDoorMetafield({ ...BASE_ARGS, admin, merchantData: {} });
    expect(out).toMatchObject({ outcome: "written", value: "https://stevemadden.in.ink/o/" });
    const set = calls.find((c) => c.query.includes("InkOrderDoorSet"));
    expect(set?.variables?.metafields?.[0]).toMatchObject({
      ownerId: "gid://shopify/Shop/1",
      namespace: "ink",
      key: "order_door",
      value: "https://stevemadden.in.ink/o/",
    });
  });

  it("no brand_slug on the doc means NO door — never a derived host", async () => {
    // brandSlug is populated (domain-derived, plausible, wrong) but the doc
    // itself carries no brand_slug. #1016: sm-test-hhawzn52.in.ink 404s.
    resolveBrandPageUrl.mockResolvedValue({
      brandSlug: "sm-test-hhawzn52",
      brandDoc: {},
    });
    const { admin, calls } = fakeAdmin({ current: null });
    const out = await assertOrderDoorMetafield({ ...BASE_ARGS, admin, merchantData: {} });
    expect(out.outcome).toBe("skipped_no_slug");
    expect(calls.some((c) => c.query.includes("InkOrderDoorSet"))).toBe(false);
  });

  it("order_door_block=false tears an existing door down", async () => {
    const { admin, calls } = fakeAdmin({ current: "https://stevemadden.in.ink/o/" });
    const out = await assertOrderDoorMetafield({
      ...BASE_ARGS,
      admin,
      merchantData: { order_door_block: false },
    });
    expect(out.outcome).toBe("deleted");
    expect(calls.some((c) => c.query.includes("InkOrderDoorDelete"))).toBe(true);
    expect(resolveBrandPageUrl).not.toHaveBeenCalled();
  });

  it("order_door_block=false with no door does nothing at all", async () => {
    const { admin, calls } = fakeAdmin({ current: null });
    const out = await assertOrderDoorMetafield({
      ...BASE_ARGS,
      admin,
      merchantData: { order_door_block: false },
    });
    expect(out.outcome).toBe("skipped_off");
    expect(calls).toHaveLength(1);
  });

  it("a caller-supplied slug writes without any proof fetch", async () => {
    // The settings flip has no proof in hand — it resolves the brand the
    // no-proof way and passes the slug. Resolution must not run at all.
    const { admin, calls } = fakeAdmin({ current: null });
    const out = await assertOrderDoorMetafield({
      shop: BASE_ARGS.shop,
      admin,
      merchantData: {},
      slug: "stevemadden",
    });
    expect(out).toMatchObject({ outcome: "written", value: "https://stevemadden.in.ink/o/" });
    expect(resolveBrandPageUrl).not.toHaveBeenCalled();
    expect(calls.some((c) => c.query.includes("InkOrderDoorSet"))).toBe(true);
  });

  it("no slug and no proof writes nothing", async () => {
    const { admin, calls } = fakeAdmin({ current: null });
    const out = await assertOrderDoorMetafield({ shop: BASE_ARGS.shop, admin, merchantData: {} });
    expect(out.outcome).toBe("skipped_no_slug");
    expect(calls.some((c) => c.query.includes("InkOrderDoorSet"))).toBe(false);
  });

  it("a thrown admin call is an outcome, never an exception", async () => {
    const { admin } = fakeAdmin({ failWith: "socket hang up" });
    const out = await assertOrderDoorMetafield({ ...BASE_ARGS, admin, merchantData: {} });
    expect(out.outcome).toBe("failed");
  });
});

// ── The writer and the extension are one contract ───────────────────────────
//
// The extension trusts only values passing its own gate; the writer mints
// values from orderDoorBase. If either side moves alone, the block silently
// renders nothing on every store — this is the test that refuses that.
//
// It used to scrape the extension's source for its regex literal. It now
// imports the extension's own functions and runs them: the same contract,
// pinned by behaviour instead of by text, so a rewrite that keeps the meaning
// stays green and a rewrite that loses it goes red. The block's own tests are
// extensions/order-page-block/src/order-page-block.test.js.
describe("the extension trusts exactly what the writer writes", () => {
  it("the writer's value passes the extension's own gate", () => {
    expect(isOrderDoorBase(orderDoorBase("stevemadden"))).toBe(true);
    expect(isOrderDoorBase(orderDoorBase("betsey-johnson"))).toBe(true);
    // And the gate still refuses what it exists to refuse.
    expect(isOrderDoorBase("http://stevemadden.in.ink/o/")).toBe(false);
    expect(isOrderDoorBase("https://evil.example.com/o/")).toBe(false);
  });

  it("the writer's door and this order's number make the link the block renders", () => {
    expect(
      linkForOrder({
        appMetafields: [{ metafield: { key: DOOR_KEY, value: orderDoorBase("stevemadden") } }],
        orderName: "#1027",
      }),
    ).toBe("https://stevemadden.in.ink/o/1027");
  });

  it("a writer that stopped minting doors takes the surface down, not a wrong link", () => {
    // The one failure mode this pairing exists to catch: the writer changing
    // shape (a trailing slash lost, a scheme downgraded, a host derived) while
    // the extension keeps its gate. The block goes dark; it never guesses.
    for (const drifted of [
      "https://stevemadden.in.ink/o",
      "http://stevemadden.in.ink/o/",
      "https://sm-test-hhawzn52.myshopify.com/o/",
    ]) {
      expect(
        linkForOrder({
          appMetafields: [{ metafield: { key: DOOR_KEY, value: drifted } }],
          orderName: "#1027",
        }),
        `a drifted writer value reached a buyer: ${drifted}`,
      ).toBeNull();
    }
  });
});
