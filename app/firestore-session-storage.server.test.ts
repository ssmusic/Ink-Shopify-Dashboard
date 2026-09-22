// TWO APPS, ONE SHOP, ONE FIRESTORE — neither app's session clobbers the other's.
//
// Shopify names an offline session `offline_{shop}`: the shop and nothing
// else, no app identity in the id. The Ritualist and ink are two apps on
// one Firestore, so with one collection a store that installs both would
// have each install overwrite the other's access token under the same
// document — and the app written second would answer 401 on every call,
// exchange a fresh token, and overwrite back. The storage keeps a
// collection per flavor. This drives the real storage class under both
// flavors against one in-memory Firestore and reads both sessions back.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/** One Firestore: `collection → docId → data`, shared across both flavors'
 *  module instances (the point of the test). */
const store = new Map<string, Map<string, Record<string, any>>>();
const col = (name: string) => {
  if (!store.has(name)) store.set(name, new Map());
  return store.get(name)!;
};
/** A chainable query: .where().where().limit().get(), as the storage and the
 *  other-app check both use it. */
function query(name: string, filter: (d: Record<string, any>) => boolean): any {
  const matches = () => [...col(name).values()].filter(filter);
  return {
    where: (field: string, _op: string, value: any) => query(name, (d) => filter(d) && d[field] === value),
    limit: () => query(name, filter),
    get: async () => ({
      empty: matches().length === 0,
      docs: matches().map((d) => ({ data: () => ({ ...d }) })),
    }),
  };
}
const fakeFirestore = {
  collection: (name: string) => ({
    doc: (id: string) => ({
      set: async (data: Record<string, any>) => { col(name).set(id, { ...data }); },
      get: async () => {
        const data = col(name).get(id);
        return { exists: Boolean(data), data: () => (data ? { ...data } : undefined) };
      },
      delete: async () => { col(name).delete(id); },
    }),
    where: (field: string, _op: string, value: any) => query(name, (d) => d[field] === value),
  }),
  batch: () => ({ delete: () => {}, commit: async () => {} }),
};
vi.mock("./firestore.server", () => ({ default: fakeFirestore }));

const SHOP = "made-up-shop.myshopify.com";
const ID = `offline_${SHOP}`;

/** The storage class as the given flavor's process would load it. */
async function storageAs(flavor: "" | "ink") {
  vi.stubEnv("APP_FLAVOR", flavor);
  vi.resetModules();
  const mod = await import("./firestore-session-storage.server");
  const { Session } = await import("@shopify/shopify-api");
  return { storage: new mod.FirestoreSessionStorage(), SESSION_COLLECTION: mod.SESSION_COLLECTION, Session, otherAppHoldsSession: mod.otherAppHoldsSession };
}

beforeEach(() => {
  store.clear();
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("two flavors, one shop", () => {
  it("stores the same session id in two collections, and each flavor reads back its own token", async () => {
    const ritualist = await storageAs("");
    await ritualist.storage.storeSession(
      new ritualist.Session({ id: ID, shop: SHOP, state: "s", isOnline: false, accessToken: "shpat_ritualist", scope: "read_orders,read_customers" }),
    );

    const ink = await storageAs("ink");
    await ink.storage.storeSession(
      new ink.Session({ id: ID, shop: SHOP, state: "s", isOnline: false, accessToken: "shpat_ink", scope: "read_orders" }),
    );

    expect(ritualist.SESSION_COLLECTION).toBe("shopify_sessions");
    expect(ink.SESSION_COLLECTION).toBe("shopify_sessions_ink");
    expect(col("shopify_sessions").get(ID)?.accessToken).toBe("shpat_ritualist");
    expect(col("shopify_sessions_ink").get(ID)?.accessToken).toBe("shpat_ink");

    // Each reads back its own — the second store did not clobber the first.
    expect((await ritualist.storage.loadSession(ID))?.accessToken).toBe("shpat_ritualist");
    expect((await ink.storage.loadSession(ID))?.accessToken).toBe("shpat_ink");
    expect((await ritualist.storage.findSessionsByShop(SHOP)).map((s) => s.accessToken)).toEqual(["shpat_ritualist"]);
    expect((await ink.storage.findSessionsByShop(SHOP)).map((s) => s.accessToken)).toEqual(["shpat_ink"]);
  });

  it("one app's uninstall (its delete) leaves the other's session where it was", async () => {
    const ritualist = await storageAs("");
    await ritualist.storage.storeSession(new ritualist.Session({ id: ID, shop: SHOP, state: "s", isOnline: false, accessToken: "shpat_ritualist" }));
    const ink = await storageAs("ink");
    await ink.storage.storeSession(new ink.Session({ id: ID, shop: SHOP, state: "s", isOnline: false, accessToken: "shpat_ink" }));

    await ritualist.storage.deleteSession(ID);

    expect(await ritualist.storage.loadSession(ID)).toBeUndefined();
    expect((await ink.storage.loadSession(ID))?.accessToken).toBe("shpat_ink");
  });

  it("each flavor can see whether the OTHER app still holds a session for the shop", async () => {
    const ritualist = await storageAs("");
    const ink = await storageAs("ink");
    expect(await ritualist.otherAppHoldsSession(SHOP)).toBe(false);
    expect(await ink.otherAppHoldsSession(SHOP)).toBe(false);

    await ink.storage.storeSession(new ink.Session({ id: ID, shop: SHOP, state: "s", isOnline: false, accessToken: "shpat_ink" }));
    expect(await ritualist.otherAppHoldsSession(SHOP)).toBe(true);
    expect(await ink.otherAppHoldsSession(SHOP)).toBe(false);

    await ritualist.storage.storeSession(new ritualist.Session({ id: ID, shop: SHOP, state: "s", isOnline: false, accessToken: "shpat_ritualist" }));
    expect(await ink.otherAppHoldsSession(SHOP)).toBe(true);
  });

  it("the Ritualist's collection keeps the name every existing session lives under", async () => {
    const ritualist = await storageAs("");
    expect(ritualist.SESSION_COLLECTION).toBe("shopify_sessions");
  });
});
