// THE TWO-DOC SHAPE, PINNED AT EVERY FIXED ROUTE.
//
// Measured 2026-09-05 (embed PR #107's own audit): a connected store can
// hold TWO merchant docs in the SAME Firestore project — the embed's own
// (doc id = the shop domain, from provisioning) and a backend-provisioned
// one (a random id, carrying `ink_api_key` and everything the shared
// resolver writes: notification prefs, the branded-tracking-link switch,
// the install date). `smusic-official.myshopify.com` holds exactly this
// shape today.
//
// Every route below used to carry its OWN private lookup — a doc-id-only
// read, or a single-field-convention query, or both in the wrong order —
// so on that shape it silently read or wrote the WRONG doc: a switch that
// saves and does nothing, a card that says "not configured" when it is, an
// install date that never appears, a GDPR erasure that leaves data behind.
// Fixed by routing every one of them through `findMerchantDocRef` /
// `findMerchantDocRefByEither` — the SAME resolver the fulfillment webhook
// already used (services/merchant-doc.server.ts).
//
// Each block below is RED against the pre-fix code (a doc-id-only or
// single-convention lookup returns the keyless domain doc, or nothing) and
// GREEN after (the resolver finds the doc carrying ink_api_key). Verified
// by hand against git stash of the fix per route before writing this file.
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── The shared two-doc fixture and a firestore stub that records writes ──

const SHOP = "smusic-official.myshopify.com";
/** The embed's own doc — id IS the shop domain, provisioned first, no key. */
const DOMAIN_DOC_ID = SHOP;
/** The backend-provisioned doc — a random id, carries the real key. */
const BACKEND_DOC_ID = "PWXStzc7mP8hn33xPbNf";

type Doc = { id: string; data: Record<string, unknown> };

function twoDocShape(extra: Record<string, unknown> = {}): Doc[] {
  return [
    { id: DOMAIN_DOC_ID, data: { shop: SHOP } },
    { id: BACKEND_DOC_ID, data: { shop_domain: SHOP, ink_api_key: "real_key", ...extra } },
  ];
}

/** A firestore stub that speaks the surface findMerchantDocRef(ByEither)
 *  uses, PLUS write tracking (`update`/`set`/`delete`/`add`) so a test can
 *  assert which doc actually changed. */
function stubFirestore(initialDocs: Doc[]) {
  const state = new Map<string, Record<string, unknown>>(initialDocs.map((d) => [d.id, { ...d.data }]));
  const deleted = new Set<string>();
  const writes: Record<string, Record<string, unknown>> = {};

  function makeRef(id: string): any {
    return {
      id,
      async get() {
        const exists = state.has(id) && !deleted.has(id);
        return { exists, data: () => (exists ? { ...state.get(id) } : undefined), ref: makeRef(id) };
      },
      async update(patch: Record<string, unknown>) {
        writes[id] = { ...(writes[id] ?? {}), ...patch };
        state.set(id, { ...(state.get(id) ?? {}), ...patch });
      },
      async set(patch: Record<string, unknown>, opts?: { merge?: boolean }) {
        const merged = opts?.merge ? { ...(state.get(id) ?? {}), ...patch } : patch;
        writes[id] = opts?.merge ? { ...(writes[id] ?? {}), ...patch } : patch;
        state.set(id, merged);
      },
      async delete() {
        deleted.add(id);
      },
    };
  }

  return {
    writes,
    deleted,
    docExists: (id: string) => state.has(id) && !deleted.has(id),
    collection(name: string) {
      if (name !== "merchants") throw new Error("unexpected collection: " + name);
      return {
        doc: (id: string) => makeRef(id),
        where(field: string, _op: string, value: unknown) {
          return {
            limit() {
              return {
                async get() {
                  const matches = [...state.entries()].filter(
                    ([id, data]) => !deleted.has(id) && data[field] === value,
                  );
                  return {
                    empty: matches.length === 0,
                    docs: matches.map(([id, data]) => ({ id, data: () => ({ ...data }), ref: makeRef(id) })),
                  };
                },
              };
            },
          };
        },
        async get() {
          const entries = [...state.entries()].filter(([id]) => !deleted.has(id));
          return { docs: entries.map(([id, data]) => ({ id, data: () => ({ ...data }), ref: makeRef(id) })) };
        },
        async add(data: Record<string, unknown>) {
          const id = "auto_" + Math.random().toString(36).slice(2, 10);
          state.set(id, { ...data });
          writes[id] = data;
          return makeRef(id);
        },
      };
    },
  };
}

beforeEach(() => {
  vi.resetModules();
});

// ─── app.api.settings.delivery-mode.tsx ───────────────────────────────────

describe("app.api.settings.delivery-mode — PATCH lands on the doc the webhook reads", () => {
  it("writes verified_delivery_mode to the ink_api_key doc, not the domain-keyed one", async () => {
    const fs = stubFirestore(twoDocShape());
    vi.doMock("../firestore.server", () => ({ default: fs }));
    vi.doMock("../shopify.server", () => ({
      authenticate: { admin: vi.fn(async () => ({ admin: {}, session: { shop: SHOP } })) },
    }));
    vi.doMock("../services/carrier-service.server", () => ({ setCarrierServiceActive: vi.fn(async () => {}) }));

    const { action } = await import("../routes/app.api.settings.delivery-mode");
    const response = await action({
      request: new Request("https://x/app/api/settings/delivery-mode", {
        method: "PATCH",
        body: JSON.stringify({ mode: "background" }),
      }),
    } as any);
    const body = await response.json();

    expect(body.mode).toBe("background");
    expect(fs.writes[BACKEND_DOC_ID]).toMatchObject({ verified_delivery_mode: "background" });
    expect(fs.writes[DOMAIN_DOC_ID]).toBeUndefined();
  });
});

// ─── app.api.dashboard.comms.tsx ──────────────────────────────────────────

describe("app.api.dashboard.comms — reads the Settings panel's own write", () => {
  it("finds notification_settings even though it lives on the OTHER doc", async () => {
    const fs = stubFirestore(twoDocShape({ notification_settings: { channels: { email: true } } }));
    vi.doMock("../firestore.server", () => ({ default: fs }));
    vi.doMock("../shopify.server", () => ({
      authenticate: { admin: vi.fn(async () => ({ session: { shop: SHOP } })) },
    }));

    const { loader } = await import("../routes/app.api.dashboard.comms");
    const response = await loader({ request: new Request("https://x/app/api/dashboard/comms") } as any);
    const body = await response.json();

    expect(body.settings).toEqual({ channels: { email: true } });
  });
});

// ─── app.api.onboarding.status.tsx ────────────────────────────────────────

describe("app.api.onboarding.status — the checklist agrees with Settings", () => {
  it("says notifications ARE on when they live on the ink_api_key doc", async () => {
    const fs = stubFirestore(
      twoDocShape({ notification_settings: { channels: { email: true, sms: false } } }),
    );
    vi.doMock("../firestore.server", () => ({ default: fs }));
    vi.doMock("../shopify.server", () => ({
      authenticate: { admin: vi.fn(async () => ({ session: { shop: SHOP } })) },
    }));
    vi.doMock("../services/email.server", () => ({ brandSlugFromDomain: () => "" }));
    vi.doMock("../services/brand-email.server", () => ({ fetchBrandEmailKit: vi.fn(async () => null) }));
    vi.doMock("../services/ink-api.server", () => ({
      getShopIdByDomain: vi.fn(async () => {
        throw new Error("not needed for this assertion");
      }),
      getMerchantTapStats: vi.fn(async () => null),
    }));

    const { loader } = await import("../routes/app.api.onboarding.status");
    const response = await loader({ request: new Request("https://x/app/api/onboarding/status") } as any);
    const body = await response.json();

    expect(body.notificationsOn).toBe(true);
  });
});

// ─── app.settings.tsx ──────────────────────────────────────────────────────

describe("app.settings loader — the install date reads the real doc", () => {
  it("finds createdAt on the ink_api_key doc when the domain-keyed doc has none", async () => {
    const createdAt = new Date("2026-01-15T00:00:00Z").toISOString();
    const fs = stubFirestore(twoDocShape({ createdAt }));
    vi.doMock("../firestore.server", () => ({ default: fs }));
    vi.doMock("../shopify.server", () => ({
      authenticate: {
        admin: vi.fn(async () => ({
          admin: { graphql: vi.fn(async () => ({ json: async () => ({ data: { shop: null } }) })) },
          session: { shop: SHOP },
        })),
      },
    }));
    vi.doMock("../services/ink-api.server", () => ({
      getInventory: vi.fn(async () => null),
      getInventoryByShopDomain: vi.fn(async () => {
        throw new Error("not needed for this assertion");
      }),
      getShopIdByDomain: vi.fn(async () => {
        throw new Error("not needed for this assertion");
      }),
    }));
    vi.doMock("../components/settings/Settings", () => ({ default: () => null }));

    const { loader } = await import("../routes/app.settings");
    const data = await (loader as any)({ request: new Request("https://x/app/settings") });

    expect(data.installedDate).toBe(
      new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(
        new Date(createdAt),
      ),
    );
  });
});

// ─── app.api.settings.inventory.tsx ───────────────────────────────────────

describe("app.api.settings.inventory — merchant_id and shopDomain both land on the keyed doc", () => {
  it("GET reads low_inventory_threshold from the real doc via merchant_id alone", async () => {
    const fs = stubFirestore(twoDocShape({ low_inventory_threshold: 7 }));
    vi.doMock("../firestore.server", () => ({ default: fs }));
    vi.doMock("../services/token-verify.server", () => ({
      verifyProxyToken: vi.fn(async () => ({ shop: undefined, merchant_id: BACKEND_DOC_ID })),
    }));

    const { loader } = await import("../routes/app.api.settings.inventory");
    const response = await loader({
      request: new Request("https://x/app/api/settings/inventory", { headers: { Authorization: "Bearer t" } }),
    } as any);
    const body = await response.json();

    expect(body.low_inventory_threshold).toBe(7);
  });

  it("POST writes to the ink_api_key doc when only shopDomain is known", async () => {
    const fs = stubFirestore(twoDocShape());
    vi.doMock("../firestore.server", () => ({ default: fs }));
    vi.doMock("../services/token-verify.server", () => ({
      verifyProxyToken: vi.fn(async () => ({ shop: SHOP, merchant_id: undefined })),
    }));

    const { action } = await import("../routes/app.api.settings.inventory");
    const response = await action({
      request: new Request("https://x/app/api/settings/inventory", {
        method: "POST",
        headers: { Authorization: "Bearer t" },
        body: JSON.stringify({ low_inventory_threshold: 3 }),
      }),
    } as any);
    await response.json();

    expect(fs.writes[BACKEND_DOC_ID]).toMatchObject({ low_inventory_threshold: 3 });
    expect(fs.writes[DOMAIN_DOC_ID]).toBeUndefined();
  });
});

// ─── app.api.settings.media.tsx ───────────────────────────────────────────

describe("app.api.settings.media — GET reads merchant_media off the keyed doc", () => {
  it("finds media saved on the doc the webhook reads, given only shopDomain", async () => {
    // The module reads INK_ADMIN_SECRET at import time (fails loudly by
    // design if unset in a real deploy); this route's Alan-upload path is
    // untouched by the fix, so a fixed test value is enough to import it.
    process.env.INK_ADMIN_SECRET = "test_admin_secret";
    const fs = stubFirestore(twoDocShape({ merchant_media: [{ id: "m1", url: "https://x/1.mp4" }] }));
    vi.doMock("../firestore.server", () => ({ default: fs }));
    vi.doMock("../shopify.server", () => ({
      authenticate: { admin: vi.fn(async () => ({ session: { shop: SHOP } })) },
    }));

    const { loader } = await import("../routes/app.api.settings.media");
    const response = await loader({ request: new Request("https://x/app/api/settings/media") } as any);
    const body = await response.json();

    expect(body.media).toEqual([{ id: "m1", url: "https://x/1.mp4" }]);
  });
});

// ─── app.api.warehouse.enroll.tsx / .upload.tsx ───────────────────────────

describe("app.api.warehouse.enroll / upload — the api-key resolution both share", () => {
  it("enroll finds the real key from shopDomain alone — the old camelCase-only query missed the backend's snake_case doc", async () => {
    const fs = stubFirestore(twoDocShape());
    vi.doMock("../firestore.server", () => ({ default: fs }));
    // No merchant_id: this token only names the shop domain (the shape an
    // embed-issued HMAC token carries). The old private lookup queried
    // ONLY the camelCase "shopDomain" field for this case — the backend
    // doc here carries snake_case shop_domain, so it found nothing.
    vi.doMock("../services/token-verify.server", () => ({
      verifyProxyToken: vi.fn(async () => ({ shop: SHOP, merchant_id: undefined })),
    }));
    vi.doMock("../services/ink-api.server", () => ({
      enrollOrder: vi.fn(async () => ({ proof_id: "proof_x", state: "pending", enrolled_at: "now" })),
      getShopIdByDomain: vi.fn(async () => "shop_x"),
      adjustMerchantInventory: vi.fn(async () => {}),
      getInventoryByShopDomain: vi.fn(async () => ({ current_count: 10 })),
    }));
    vi.doMock("../session-utils.server", () => ({ getOfflineSession: vi.fn(async () => null) }));

    const enrollMod = await import("../services/ink-api.server");
    const { action } = await import("../routes/app.api.warehouse.enroll");
    const response = await action({
      request: new Request("https://x/app/api/warehouse/enroll", {
        method: "POST",
        headers: { Authorization: "Bearer t" },
        body: JSON.stringify({
          order_id: "1001",
          nfc_token: "nfc_tok",
          order_number: "1001",
          customer_email: "buyer@example.com",
          shipping_address: { line1: "1 Main St" },
          product_details: [{ title: "Widget" }],
        }),
      }),
    } as any);
    const body = await response.json();

    expect(response.status ?? 200).not.toBe(404);
    expect(body.success).toBe(true);
    expect((enrollMod.enrollOrder as any).mock.calls[0][0]).toBe("real_key");
  });

  it("upload finds the real key from shopDomain alone — same fix, same old gap", async () => {
    const fs = stubFirestore(twoDocShape());
    vi.doMock("../firestore.server", () => ({ default: fs }));
    vi.doMock("../services/token-verify.server", () => ({
      verifyProxyToken: vi.fn(async () => ({ shop: SHOP, merchant_id: undefined })),
    }));
    vi.doMock("../services/ink-api.server", () => ({
      uploadMedia: vi.fn(async () => ({ media_id: "m1", media_url: "https://x/m1.jpg" })),
      adjustMerchantInventory: vi.fn(async () => {}),
      getShopIdByDomain: vi.fn(async () => "shop_x"),
    }));

    const uploadMod = await import("../services/ink-api.server");
    const { action } = await import("../routes/app.api.warehouse.upload");
    const form = new FormData();
    form.set("proof_id", "proof_x");
    form.set("media_type", "photo");
    form.set("file", new File(["x"], "x.jpg", { type: "image/jpeg" }));
    const response = await action({
      request: new Request("https://x/app/api/warehouse/upload", {
        method: "POST",
        headers: { Authorization: "Bearer t" },
        body: form,
      }),
    } as any);
    const body = await response.json();

    expect(body.success).toBe(true);
    expect((uploadMod.uploadMedia as any).mock.calls[0][0]).toBe("real_key");
  });
});

// ─── app.api.auth.login.tsx ────────────────────────────────────────────────

describe("app.api.auth.login — the INK v1.3.0 key-cache heals the real doc, not a third one", () => {
  it("updates the ink_api_key doc in place instead of creating a new domain-keyed doc", async () => {
    const fs = stubFirestore(twoDocShape());
    vi.doMock("../firestore.server", () => ({ default: fs }));
    vi.doMock("../services/ink-api.server", () => ({
      loginUser: vi.fn(async () => ({
        token: "t",
        user: { merchant_id: SHOP, user_id: "u1", name: "Test", email: "a@b.com", role: "merchant" },
      })),
      createMerchant: vi.fn(async () => ({ api_key: "fresh_key" })),
    }));

    const { action } = await import("../routes/app.api.auth.login");
    const response = await action({
      request: new Request("https://x/app/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ email: "a@b.com", password: "pw" }),
      }),
    } as any);
    await response.json();

    expect(fs.writes[BACKEND_DOC_ID]).toMatchObject({ ink_api_key: "fresh_key" });
    // The domain-keyed doc must NOT have been (re)written with a fresh key —
    // that write is exactly how a store ends up with two live keys.
    expect(fs.writes[DOMAIN_DOC_ID]).toBeUndefined();
  });
});

// ─── webhooks.shop.redact.tsx ──────────────────────────────────────────────

describe("webhooks.shop.redact — GDPR erasure removes BOTH docs", () => {
  it("deletes the ink_api_key doc as well as the domain-keyed one", async () => {
    const fs = stubFirestore(twoDocShape());
    vi.doMock("../firestore.server", () => ({ default: fs }));
    vi.doMock("../shopify.server", () => ({
      authenticate: { webhook: vi.fn(async () => ({ topic: "shop/redact", shop: SHOP })) },
    }));
    vi.doMock("../services/ink-api.server", () => ({
      purgeShopInInk: vi.fn(async () => ({ ok: true, body: { counts: {} } })),
    }));

    const { action } = await import("../routes/webhooks.shop.redact");
    const response = await action({ request: new Request("https://x/webhooks/shop/redact", { method: "POST" }) } as any);

    expect(response.status).toBe(200);
    expect(fs.docExists(DOMAIN_DOC_ID)).toBe(false);
    expect(fs.docExists(BACKEND_DOC_ID)).toBe(false);
  });

  it("a single-doc shop (no split) still gets deleted exactly once — no error from the second delete", async () => {
    const fs = stubFirestore([{ id: SHOP, data: { shop: SHOP, ink_api_key: "only_key" } }]);
    vi.doMock("../firestore.server", () => ({ default: fs }));
    vi.doMock("../shopify.server", () => ({
      authenticate: { webhook: vi.fn(async () => ({ topic: "shop/redact", shop: SHOP })) },
    }));
    vi.doMock("../services/ink-api.server", () => ({
      purgeShopInInk: vi.fn(async () => ({ ok: true, body: {} })),
    }));

    const { action } = await import("../routes/webhooks.shop.redact");
    const response = await action({ request: new Request("https://x/webhooks/shop/redact", { method: "POST" }) } as any);

    expect(response.status).toBe(200);
    expect(fs.docExists(SHOP)).toBe(false);
  });
});

// ─── webhooks.orders_create.ts ─────────────────────────────────────────────

describe("webhooks.orders_create — auto-enroll uses the ink_api_key doc's key", () => {
  it("enrolls with the real key resolved from the shop domain, not nothing", async () => {
    const fs = stubFirestore(twoDocShape());
    vi.doMock("../firestore.server", () => ({ default: fs }));

    const orderPayload = {
      admin_graphql_api_id: "gid://shopify/Order/1",
      id: 1,
      name: "#1001",
      order_number: 1001,
      shipping_address: { phone: null },
      phone: null,
      customer: { email: "buyer@example.com", phone: null },
      shipping_lines: [],
      order_status_url: "https://shop.myshopify.com/orders/abc/status",
    };

    const fakeAdmin = {
      graphql: vi.fn(async (query: string) => {
        if (query.includes("AutoEnrollOrder")) {
          return {
            json: async () => ({
              data: {
                order: {
                  id: "gid://shopify/Order/1",
                  name: "#1001",
                  customer: { email: "buyer@example.com", phone: null, firstName: "Buyer", lastName: "Test" },
                  shippingAddress: {
                    name: "Buyer Test",
                    address1: "1 Main St",
                    address2: null,
                    city: "Metropolis",
                    province: "NY",
                    zip: "10001",
                    country: "US",
                  },
                  totalPriceSet: { shopMoney: { amount: "10.00", currencyCode: "USD" } },
                  lineItems: {
                    edges: [
                      {
                        node: {
                          title: "Widget",
                          quantity: 1,
                          sku: "W1",
                          originalUnitPriceSet: { shopMoney: { amount: "10.00" } },
                          image: null,
                        },
                      },
                    ],
                  },
                  metafield: null,
                  fulfillments: [],
                },
              },
            }),
          };
        }
        if (query.includes("AutoEnrollProductUrls")) {
          return {
            json: async () => ({
              data: { order: { lineItems: { edges: [{ node: { product: null } }] } } },
            }),
          };
        }
        if (query.includes("AddOrderTag")) {
          return { json: async () => ({ data: { tagsAdd: { userErrors: [] } } }) };
        }
        if (query.includes("SetInkMetafields")) {
          return { json: async () => ({ data: { metafieldsSet: { userErrors: [] } } }) };
        }
        return { json: async () => ({ data: {} }) };
      }),
    };

    vi.doMock("../shopify.server", () => ({
      authenticate: {
        webhook: vi.fn(async () => ({ payload: orderPayload, shop: SHOP, admin: fakeAdmin })),
      },
    }));

    const inkApi = {
      enrollOrder: vi.fn(async () => ({ proof_id: "proof_x", state: "pending", enrolled_at: "now" })),
      createMerchant: vi.fn(async () => ({ api_key: "should_not_be_called" })),
    };
    vi.doMock("../services/ink-api.server", () => inkApi);

    const { action } = await import("../routes/webhooks.orders_create");
    const response = await action({
      request: new Request("https://x/webhooks/orders_create", { method: "POST" }),
    } as any);

    expect(response.status).toBe(200);
    expect(inkApi.enrollOrder).toHaveBeenCalled();
    // THE ASSERTION: the key handed to Alan's /api/enroll is the one on the
    // doc that actually carries it — never null, never re-provisioned.
    expect((inkApi.enrollOrder as any).mock.calls[0][0]).toBe("real_key");
    expect(inkApi.createMerchant).not.toHaveBeenCalled();
  });
});

// ─── app.tsx loader — the self-provisioning IIFE ──────────────────────────

describe("app.tsx loader — self-provisioning never re-mints a key the OTHER doc already has", () => {
  it("does not call createMerchant when the ink_api_key doc already exists under a different id", async () => {
    const fs = stubFirestore(twoDocShape());
    vi.doMock("../firestore.server", () => ({ default: fs }));
    vi.doMock("../shopify.server", () => ({
      authenticate: {
        admin: vi.fn(async () => ({
          // A real owner email, so a pre-fix run would actually REACH
          // createMerchant() instead of bailing out earlier for an
          // unrelated reason (an empty-shop mock would pass either way).
          admin: {
            graphql: vi.fn(async () => ({
              json: async () => ({ data: { shop: { name: "Test Shop", email: "owner@example.com" } } }),
            })),
          },
          session: { shop: SHOP },
        })),
      },
      registerWebhooks: vi.fn(async () => {}),
    }));
    vi.doMock("../services/carrier-service.server", () => ({
      ensureCarrierServiceRegistered: vi.fn(async () => {}),
    }));
    const createMerchant = vi.fn(async () => ({ api_key: "should_never_be_minted" }));
    vi.doMock("../services/ink-api.server", () => ({ createMerchant }));

    const { loader } = await import("../routes/app");
    await loader({ request: new Request("https://x/app") } as any);
    // The provisioning check happens in a fire-and-forget IIFE (the loader
    // must never delay the app's render on it) — flush the microtask queue
    // before asserting.
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    // The OLD `getMerchant(session.shop)` only ever checked doc(shop) by id
    // — on this shape it would see no key, call createMerchant() again on
    // THIS load and every load after, and heal the key onto the WRONG
    // (domain-keyed) doc. findMerchantDocRef finds the real one first.
    expect(createMerchant).not.toHaveBeenCalled();
    expect(fs.writes[DOMAIN_DOC_ID]).toBeUndefined();
    expect(fs.writes[BACKEND_DOC_ID]).toBeUndefined();
  });

  it("heals the doc that already exists (keyless) rather than forking a second one, on a genuine re-provision", async () => {
    // A store with ONE doc, keyless (e.g. provisioning died before Alan
    // answered) — provisioning must write the key onto THAT doc.
    const fs = stubFirestore([{ id: DOMAIN_DOC_ID, data: { shop: SHOP } }]);
    vi.doMock("../firestore.server", () => ({ default: fs }));
    vi.doMock("../shopify.server", () => ({
      authenticate: {
        admin: vi.fn(async () => ({
          admin: {
            graphql: vi.fn(async () => ({
              json: async () => ({ data: { shop: { name: "Test Shop", email: "owner@example.com" } } }),
            })),
          },
          session: { shop: SHOP },
        })),
      },
      registerWebhooks: vi.fn(async () => {}),
    }));
    vi.doMock("../services/carrier-service.server", () => ({
      ensureCarrierServiceRegistered: vi.fn(async () => {}),
    }));
    const createMerchant = vi.fn(async () => ({ api_key: "newly_minted_key" }));
    vi.doMock("../services/ink-api.server", () => ({ createMerchant }));

    const { loader } = await import("../routes/app");
    await loader({ request: new Request("https://x/app") } as any);
    await new Promise((r) => setTimeout(r, 0));
    await new Promise((r) => setTimeout(r, 0));

    expect(createMerchant).toHaveBeenCalledOnce();
    expect(fs.writes[DOMAIN_DOC_ID]).toMatchObject({ ink_api_key: "newly_minted_key" });
  });
});
