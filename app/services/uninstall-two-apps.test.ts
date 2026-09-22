// TWO APPS, ONE STORE — the uninstall webhook driven end to end, three
// orders, and in every one the shared merchant doc (the key) is untouched.
//
//   · ink + the Ritualist installed, the Ritualist uninstalls → its own
//     sessions gone, the key intact, plan → ink;
//   · ink uninstalls alone (the Ritualist still there) → ink's sessions
//     gone, the key intact, plan unchanged;
//   · the last app uninstalls → today's cleanup (sessions), nothing else —
//     the merchant is shop/redact's, 48 hours on.
//
// Uninstalling one app must never blank the other's key: the backend's
// create door rotates the key on every call, and the only thing standing
// between two apps and a re-key loop is that the shared doc still carries
// one. The fake Firestore below records every write to `merchants` so the
// assertion is "none", not "no delete".

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const webhook = vi.fn();
vi.mock("../shopify.server", () => ({ authenticate: { webhook } }));

const SHOP = "made-up-shop.myshopify.com";

/** One Firestore, two session collections, one shared merchants doc. */
const sessions: Record<string, Array<{ id: string; shop: string; isOnline: boolean }>> = {
  shopify_sessions: [],
  shopify_sessions_ink: [],
};
const merchantWrites: string[] = [];
const merchantDoc = { shop: SHOP, ink_api_key: "ink_live_shared_key", ink_shop_id: "shop_abc123" };
const deleted: string[] = [];

const fakeFirestore = {
  collection: (name: string) => {
    if (name === "merchants") {
      return {
        doc: () => ({
          get: async () => ({ exists: true, data: () => ({ ...merchantDoc }) }),
          set: async (data: any) => { merchantWrites.push(`set:${JSON.stringify(data)}`); },
          update: async (data: any) => { merchantWrites.push(`update:${JSON.stringify(data)}`); },
          delete: async () => { merchantWrites.push("delete"); },
        }),
        where: () => ({ limit: () => ({ get: async () => ({ empty: true, docs: [] }) }) }),
      };
    }
    // A session collection: .where("shop").get() for the delete; .where().where().limit().get() for the other-app check.
    const rows = () => sessions[name] ?? [];
    const snap = (filter: (r: any) => boolean) => ({
      empty: rows().filter(filter).length === 0,
      docs: rows().filter(filter).map((r) => ({ data: () => r, ref: { id: r.id, collection: name } })),
    });
    return {
      where: (field: string, _op: string, value: any) => ({
        get: async () => snap((r) => r[field] === value),
        where: (f2: string, _o2: string, v2: any) => ({
          limit: () => ({ get: async () => snap((r) => r[field] === value && r[f2] === v2) }),
        }),
      }),
    };
  },
  batch: () => {
    const ops: Array<{ id: string; collection: string }> = [];
    return {
      delete: (ref: { id: string; collection: string }) => ops.push(ref),
      commit: async () => {
        for (const op of ops) {
          sessions[op.collection] = (sessions[op.collection] ?? []).filter((r) => r.id !== op.id);
          deleted.push(`${op.collection}/${op.id}`);
        }
      },
    };
  },
};
vi.mock("../firestore.server", () => ({ default: fakeFirestore }));

// merchant.server / ink-install go through the fake Firestore for reads;
// updateMerchant is the one writer the hand-back uses (a set-merge on the
// shared doc), so it is real and lands in merchantWrites.
const fetchMock = vi.fn();

async function uninstall(flavor: "" | "ink") {
  vi.stubEnv("APP_FLAVOR", flavor);
  vi.resetModules();
  const own = flavor === "ink" ? "shopify_sessions_ink" : "shopify_sessions";
  const session = sessions[own].find((r) => r.shop === SHOP) ?? undefined;
  webhook.mockResolvedValue({ shop: SHOP, session, topic: "APP_UNINSTALLED" });
  const { action } = await import("../routes/webhooks.app.uninstalled");
  return action({ request: new Request("https://app.test/webhooks/app/uninstalled", { method: "POST" }), params: {}, context: {} } as any);
}

function patchCalls() {
  return fetchMock.mock.calls
    .filter(([, init]) => (init as RequestInit)?.method === "PATCH")
    .map(([url, init]) => ({ url: String(url), body: JSON.parse(String((init as RequestInit).body)) }));
}

beforeEach(() => {
  vi.stubEnv("INK_ADMIN_SECRET", "test-secret");
  vi.stubEnv("INK_API_URL", "https://api.test");
  sessions.shopify_sessions = [];
  sessions.shopify_sessions_ink = [];
  merchantWrites.length = 0;
  deleted.length = 0;
  fetchMock.mockReset();
  fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ merchant: { plan: "ink" } }) });
  vi.stubGlobal("fetch", fetchMock);
  vi.spyOn(console, "log").mockImplementation(() => {});
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

const bothInstalled = () => {
  sessions.shopify_sessions = [{ id: `offline_${SHOP}`, shop: SHOP, isOnline: false }];
  sessions.shopify_sessions_ink = [{ id: `offline_${SHOP}`, shop: SHOP, isOnline: false }];
};

describe("ink + the Ritualist installed, the Ritualist uninstalls", () => {
  it("deletes only its own sessions, leaves the key, and hands the plan back to ink", async () => {
    bothInstalled();
    const res = await uninstall("");

    expect(res.status).toBe(200);
    expect(deleted).toEqual([`shopify_sessions/offline_${SHOP}`]);
    expect(sessions.shopify_sessions_ink).toHaveLength(1);
    expect(patchCalls()).toEqual([{ url: "https://api.test/admin/merchants/shop_abc123", body: { plan: "ink", ritualist_installed_at: null } }]);
    // The shared doc: the stamp cleared, and nothing else — never the key.
    expect(merchantWrites).toHaveLength(1);
    expect(merchantWrites[0]).toMatch(/^set:/);
    const written = JSON.parse(merchantWrites[0].slice(4));
    expect(written.ritualist_plan_claimed_at).toBeNull();
    expect(written).not.toHaveProperty("ink_api_key");
    expect(merchantWrites.some((w) => w === "delete")).toBe(false);
  });

  it("answers 500 so Shopify retries when the backend blips, and the key is still untouched", async () => {
    bothInstalled();
    fetchMock.mockResolvedValue({ ok: false, status: 503, statusText: "Service Unavailable", json: async () => null });
    const res = await uninstall("");
    expect(res.status).toBe(500);
    expect(merchantWrites).toEqual([]);
  });

  it("acks a refusal (the door does not know `plan` yet) — a retry cannot change it — and the key is still untouched", async () => {
    bothInstalled();
    fetchMock.mockResolvedValue({ ok: false, status: 400, statusText: "Bad Request", json: async () => ({ error: "No updatable fields provided" }) });
    const res = await uninstall("");
    expect(res.status).toBe(200);
    expect(merchantWrites).toEqual([]);
  });

  it("still hands back on a Shopify redelivery after its sessions are already gone", async () => {
    sessions.shopify_sessions_ink = [{ id: `offline_${SHOP}`, shop: SHOP, isOnline: false }];
    const res = await uninstall("");
    expect(res.status).toBe(200);
    expect(deleted).toEqual([]);
    expect(patchCalls()).toEqual([{ url: "https://api.test/admin/merchants/shop_abc123", body: { plan: "ink", ritualist_installed_at: null } }]);
  });
});

describe("ink uninstalls alone (the Ritualist still installed)", () => {
  it("deletes only ink's sessions; the key intact, the plan unchanged", async () => {
    bothInstalled();
    const res = await uninstall("ink");

    expect(res.status).toBe(200);
    expect(deleted).toEqual([`shopify_sessions_ink/offline_${SHOP}`]);
    expect(sessions.shopify_sessions).toHaveLength(1);
    expect(patchCalls()).toEqual([]);
    expect(merchantWrites).toEqual([]);
  });
});

describe("the last app uninstalls", () => {
  it("the Ritualist alone: today's cleanup — its sessions, nothing else", async () => {
    sessions.shopify_sessions = [{ id: `offline_${SHOP}`, shop: SHOP, isOnline: false }];
    const res = await uninstall("");
    expect(res.status).toBe(200);
    expect(deleted).toEqual([`shopify_sessions/offline_${SHOP}`]);
    expect(patchCalls()).toEqual([]);
    expect(merchantWrites).toEqual([]);
  });

  it("ink alone: its sessions, nothing else", async () => {
    sessions.shopify_sessions_ink = [{ id: `offline_${SHOP}`, shop: SHOP, isOnline: false }];
    const res = await uninstall("ink");
    expect(res.status).toBe(200);
    expect(deleted).toEqual([`shopify_sessions_ink/offline_${SHOP}`]);
    expect(patchCalls()).toEqual([]);
    expect(merchantWrites).toEqual([]);
  });
});
