// THE CHARGES — a paid charge always mints its key (record-charges.server.ts).
//
// What these pin:
//   1. A charge is remembered once; the return re-telling it never overwrites.
//   2. The settle mints ONLY an ACTIVE charge, closes a declined one, waits on
//      a pending one; a refusal the backend will keep giving closes the charge
//      (loudly), a blip leaves it for the next screen.
//   3. A row's door: nothing without a shop, nothing (and no purchases read)
//      without a price; the price line only with the switch on; a bought
//      order shows its purchase and is not locked.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type Row = Record<string, unknown>;
const docs = new Map<string, Row>();
const created: string[] = [];
vi.mock("../firestore.server", () => ({
  default: {
    collection: () => ({
      doc: (id: string) => ({
        create: async (data: Row) => {
          if (docs.has(id)) { throw Object.assign(new Error("ALREADY_EXISTS"), { code: 6 }); }
          docs.set(id, data); created.push(id);
        },
        update: async (u: Row) => { docs.set(id, { ...docs.get(id), ...u }); },
      }),
      where: (_f1: string, _o1: string, shop: string) => ({
        where: (_f2: string, _o2: string, state: string) => ({
          get: async () => ({ docs: [...docs.entries()].filter(([, d]) => d.shop === shop && d.state === state).map(([id, d]) => ({ id, data: () => d })) }),
        }),
      }),
    }),
  },
}));

class InkApiError extends Error { status: number; constructor(m: string, s: number) { super(m); this.status = s; } }
const createRecordPurchase = vi.fn();
const listRecordPurchases = vi.fn();
// The backend's resolved price (GET /admin/purchases/price): null = free.
const readRecordPrice = vi.fn<(shopId: string) => Promise<{ price_cents: number; currency: string } | null>>();
vi.mock("./ink-api.server", () => ({ createRecordPurchase, listRecordPurchases, readRecordPrice, InkApiError }));

const { rememberRecordCharge, settleRecordCharges, readRecordDoors, recordDoorFor } = await import("./record-charges.server");

const SHOP = "made-up-shop.myshopify.com";
const P1 = "proof_" + "1".repeat(24);
const P2 = "proof_" + "2".repeat(24);
const gid = (n: number) => `gid://shopify/AppPurchaseOneTime/${n}`;

function admin(statuses: Record<string, string | null>) {
  return {
    graphql: vi.fn(async (_q: string, o?: { variables?: Record<string, unknown> }) => {
      const id = String(o?.variables?.id);
      const status = statuses[id];
      return { json: async () => ({ data: { node: status ? { id, status, test: false, price: { amount: "15.00", currencyCode: "USD" } } : null } }) };
    }),
  };
}

beforeEach(() => { docs.clear(); created.length = 0; createRecordPurchase.mockReset(); listRecordPurchases.mockReset(); readRecordPrice.mockReset(); readRecordPrice.mockResolvedValue(null); });
afterEach(() => vi.unstubAllEnvs());

describe("remember", () => {
  it("writes a charge once; the return re-telling it with another order changes nothing", async () => {
    await rememberRecordCharge(SHOP, P1, gid(7));
    await rememberRecordCharge(SHOP, P2, gid(7));
    expect(created).toEqual([`${SHOP}__7`]);
    expect(docs.get(`${SHOP}__7`)).toMatchObject({ shop: SHOP, proof_id: P1, charge_id: gid(7), state: "pending" });
  });
});

describe("settle", () => {
  it("mints only the ACTIVE charge, closes the declined, waits on the pending", async () => {
    await rememberRecordCharge(SHOP, P1, gid(1));
    await rememberRecordCharge(SHOP, P2, gid(2));
    await rememberRecordCharge(SHOP, P2, gid(3));
    createRecordPurchase.mockResolvedValue({ id: "pur_1" });
    const r = await settleRecordCharges(admin({ [gid(1)]: "ACTIVE", [gid(2)]: "DECLINED", [gid(3)]: "PENDING" }), SHOP, "shop_1");
    expect(r).toEqual({ minted: 1, closed: 1, waiting: 1 });
    expect(createRecordPurchase).toHaveBeenCalledTimes(1);
    expect(createRecordPurchase).toHaveBeenCalledWith({ proof_id: P1, shop_id: "shop_1", charge_id: gid(1), price_cents: 1500, currency: "USD", test: false });
    expect(docs.get(`${SHOP}__1`)!.state).toBe("minted");
    expect(docs.get(`${SHOP}__2`)!.state).toBe("declined");
    expect(docs.get(`${SHOP}__3`)!.state).toBe("pending");
  });

  it("a refusal the backend will keep giving closes the charge; a blip leaves it pending", async () => {
    await rememberRecordCharge(SHOP, P1, gid(4));
    await rememberRecordCharge(SHOP, P2, gid(5));
    createRecordPurchase.mockImplementation(async (i: { charge_id: string }) => {
      throw new InkApiError("refused", i.charge_id === gid(4) ? 409 : 503);
    });
    const r = await settleRecordCharges(admin({ [gid(4)]: "ACTIVE", [gid(5)]: "ACTIVE" }), SHOP, "shop_1");
    expect(r).toEqual({ minted: 0, closed: 1, waiting: 1 });
    expect(docs.get(`${SHOP}__4`)).toMatchObject({ state: "refused", refused_status: 409 });
    expect(docs.get(`${SHOP}__5`)!.state).toBe("pending");
  });

  it("does nothing without a backend merchant", async () => {
    await rememberRecordCharge(SHOP, P1, gid(6));
    expect(await settleRecordCharges(admin({ [gid(6)]: "ACTIVE" }), SHOP, "")).toEqual({ minted: 0, closed: 0, waiting: 0 });
    expect(createRecordPurchase).not.toHaveBeenCalled();
  });
});

describe("a row's door", () => {
  const view = (shopId = "shop_1") => ({ shop: SHOP, shopId });
  const priced = (price_cents: number) => readRecordPrice.mockResolvedValue({ price_cents, currency: "USD" });

  it("free (the backend says null — a merchant priced at 0) and nothing minted: no door, and no purchases are read", async () => {
    const doors = await readRecordDoors(admin({}), view(), [P1]);
    expect(readRecordPrice).toHaveBeenCalledWith("shop_1");
    expect(doors).toEqual({});
    expect(listRecordPurchases).not.toHaveBeenCalled();
    expect(recordDoorFor(doors, P1)).toEqual({ locked: false, offerLine: null, purchase: null });
  });

  it("priced with the switch off: locked, no price line; with it on: the price line", async () => {
    listRecordPurchases.mockResolvedValue([]);
    priced(1500);
    expect((await readRecordDoors(admin({}), view(), [P1]))[P1]).toEqual({ locked: true, offerLine: null, purchase: null });
    vi.stubEnv("RECORD_PURCHASES_ENABLED", "true");
    expect((await readRecordDoors(admin({}), view(), [P1]))[P1]).toEqual({ locked: true, offerLine: "Get the record — $15", purchase: null });
  });

  it("the backend's default (a merchant with no price) reads as $29 — the number is the backend's, not this app's", async () => {
    listRecordPurchases.mockResolvedValue([]);
    priced(2900);
    expect((await readRecordDoors(admin({}), view(), [P1]))[P1]).toEqual({ locked: true, offerLine: null, purchase: null });
    vi.stubEnv("RECORD_PURCHASES_ENABLED", "true");
    expect((await readRecordDoors(admin({}), view(), [P1]))[P1]).toEqual({ locked: true, offerLine: "Get the record — $29", purchase: null });
  });

  it("a bought order shows its purchase and is not locked", async () => {
    vi.stubEnv("RECORD_PURCHASES_ENABLED", "true");
    listRecordPurchases.mockResolvedValue([{ id: "pur_9", proof_id: P1, packet_url: "https://www.in.ink/verify/x?key=k", outcome: "open" }]);
    priced(1500);
    const doors = await readRecordDoors(admin({}), view(), [P1, P2, null]);
    expect(doors[P1]).toEqual({ locked: false, offerLine: null, purchase: { id: "pur_9", packet_url: "https://www.in.ink/verify/x?key=k", outcome: "open" } });
    expect(doors[P2]).toEqual({ locked: true, offerLine: "Get the record — $15", purchase: null });
  });
});
