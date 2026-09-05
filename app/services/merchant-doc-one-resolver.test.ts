// ONE RESOLVER — every writer of a per-merchant field saves into the document
// its reader opens.
//
// The landmine (Bible §17.2) is a route that carries its own merchant lookup.
// Each private copy knows a different subset of the conventions — doc id IS the
// shop domain (the embed's own shape), field `shop`, camelCase `shopDomain`,
// snake_case `shop_domain` — and picks a different winner when a store holds
// more than one merchant document. The merchant flips a switch, the screen says
// saved, and the thing the switch governs reads the other document.
//
// MEASURED 2026-09-05, read-only, across the thirteen shops holding a Shopify
// session: `smusic-official.myshopify.com` holds three merchant documents and
// resolves two ways — `findMerchantDocRef` opens `PWXStzc7mP8hn33xPbNf` (the
// one carrying `ink_api_key`), every private doc-id-first copy opened
// `smusic-official.myshopify.com`. Four fields landed on the wrong side of
// that split: `branded_tracking_link` (PR #107), `merchant_media`,
// `notification_settings`, and `ink_api_key` itself.
//
// These pins go red if a private lookup comes back.
import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import type { Firestore } from "firebase-admin/firestore";
import { findMerchantDocRefByShopOrId } from "./merchant-doc.server";

const src = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");

type Doc = { id: string; data: Record<string, unknown> };

/** Minimal firestore stub speaking the exact surface the resolvers use. */
function stubFirestore(docs: Doc[]) {
  return {
    collection(name: string) {
      if (name !== "merchants") throw new Error("unexpected collection " + name);
      return {
        doc(id: string) {
          const hit = docs.find((d) => d.id === id);
          const ref = { id, __isRef: true };
          return {
            ...ref,
            async get() {
              return { exists: Boolean(hit), data: () => hit?.data, ref };
            },
          };
        },
        where(field: string, _op: string, value: unknown) {
          return {
            limit() {
              return {
                async get() {
                  const matches = docs.filter((d) => d.data[field] === value);
                  return {
                    empty: matches.length === 0,
                    docs: matches.map((d) => ({
                      data: () => d.data,
                      ref: { id: d.id, __isRef: true },
                    })),
                  };
                },
              };
            },
          };
        },
      };
    },
  } as unknown as Firestore;
}

// The measured shape of smusic-official.myshopify.com, 2026-09-05: three docs,
// only one carrying the api key, reachable by three different conventions.
const SPLIT_STORE: Doc[] = [
  { id: "smusic-official.myshopify.com", data: {} },
  { id: "PWXStzc7mP8hn33xPbNf", data: { shopDomain: "smusic-official.myshopify.com", ink_api_key: "k_real" } },
  { id: "shop_a325592c9b37b6e9", data: { shop_domain: "smusic-official.myshopify.com", status: "active" } },
];

describe("findMerchantDocRefByShopOrId — the token path lands where the session path lands", () => {
  it("prefers the shop domain, and picks the doc that carries the key", async () => {
    const hit = await findMerchantDocRefByShopOrId(
      stubFirestore(SPLIT_STORE),
      "smusic-official.myshopify.com",
      "smusic-official.myshopify.com",
    );
    expect(hit!.ref.id).toBe("PWXStzc7mP8hn33xPbNf");
    expect(hit!.apiKey).toBe("k_real");
  });

  it("a merchant_id that names its shop CONVERGES on the session path's answer", async () => {
    // The PWA token carries only Alan's merchant_id. Reading that document and
    // stopping there is what put the media on the doc the tap never opens.
    const hit = await findMerchantDocRefByShopOrId(
      stubFirestore(SPLIT_STORE),
      undefined,
      "shop_a325592c9b37b6e9",
    );
    expect(hit!.ref.id).toBe("PWXStzc7mP8hn33xPbNf");
  });

  it("falls back to the merchant_id document when nothing names a shop", async () => {
    const hit = await findMerchantDocRefByShopOrId(
      stubFirestore([{ id: "orphan_1", data: { ink_api_key: "k_orphan" } }]),
      undefined,
      "orphan_1",
    );
    expect(hit!.ref.id).toBe("orphan_1");
    expect(hit!.apiKey).toBe("k_orphan");
  });

  it("returns null when neither identifier resolves — the caller decides", async () => {
    expect(await findMerchantDocRefByShopOrId(stubFirestore([]), "ghost.myshopify.com", "nope")).toBeNull();
    expect(await findMerchantDocRefByShopOrId(stubFirestore(SPLIT_STORE), null, null)).toBeNull();
  });
});

describe("SAVES WHERE THE READER READS — source pins, one per writer", () => {
  it("settings/media saves where api/verify reads (measured: smusic-official)", () => {
    const ROUTE = src("app/routes/app.api.settings.media.tsx");
    expect(ROUTE).toContain("findMerchantDocRefByShopOrId");
    expect(ROUTE).not.toContain("async function getMerchantDoc");
    expect(ROUTE).toMatch(/hit\.ref\.update\(/);
  });

  it("settings/inventory saves where the enroll gate reads", () => {
    const ROUTE = src("app/routes/app.api.settings.inventory.tsx");
    const GATE = src("app/routes/app.api.warehouse.enroll.tsx");
    expect(ROUTE).toContain("findMerchantDocRefByShopOrId");
    expect(ROUTE).not.toContain("async function getMerchantDoc");
    // Both ends of min_enrollment_value, same resolver.
    expect(GATE).toContain("findMerchantDocRefByShopOrId");
    expect(GATE).not.toMatch(/where\("shopDomain",/);
  });

  it("settings/delivery-mode saves where orders/create reads", () => {
    const ROUTE = src("app/routes/app.api.settings.delivery-mode.tsx");
    const WEBHOOK = src("app/routes/webhooks.orders_create.ts");
    expect(ROUTE).toContain("findMerchantDocRef");
    expect(ROUTE).not.toContain("async function getMerchantDoc");
    expect(ROUTE).toMatch(/hit\.ref\.update\(/);
    expect(WEBHOOK).toContain("findMerchantDoc");
    expect(WEBHOOK).not.toMatch(/where\("shopDomain",/);
  });

  it("the api key is cached where every reader of it looks", () => {
    const LOGIN = src("app/routes/app.api.auth.login.tsx");
    const CREATE = src("app/routes/webhooks.orders_create.ts");
    const UPLOAD = src("app/routes/app.api.warehouse.upload.tsx");
    for (const s of [LOGIN, CREATE, UPLOAD]) {
      expect(s).toMatch(/findMerchantDocRef|findMerchantDocRefByShopOrId|findMerchantDoc/);
      expect(s).not.toMatch(/where\("shopDomain",/);
    }
  });

  it("provisioning seeds the doc the fulfillment webhooks open", () => {
    const SVC = src("app/services/merchant.server.ts");
    expect(SVC).toContain("findMerchantDocRef");
    // The bare doc-id read/write is gone from both getMerchant and updateMerchant.
    expect(SVC).not.toMatch(/collection\(COLLECTION\)\.doc\(shop\)\.get\(\)/);
    // doc(shop) survives only as the create path for a shop with no doc at all.
    expect(SVC).toMatch(/hit\?\.ref \?\? firestore\.collection\(COLLECTION\)\.doc\(shop\)/);
  });

  it("the dashboard and onboarding read the notification toggles that were saved", () => {
    const COMMS = src("app/routes/app.api.dashboard.comms.tsx");
    const ONBOARD = src("app/routes/app.api.onboarding.status.tsx");
    const WRITER = src("app/routes/app.api.settings.notifications.tsx");
    expect(WRITER).toContain("findMerchantDocRef");
    expect(COMMS).toContain("findMerchantDoc");
    expect(COMMS).not.toMatch(/\.doc\(session\.shop\)\.get\(\)/);
    expect(ONBOARD).toContain("findMerchantDoc");
    expect(ONBOARD).not.toMatch(/collection\("merchants"\)\.doc\(shop\)\.get\(\)/);
  });

  it("the Settings install date reads the doc provisioning stamped", () => {
    const PAGE = src("app/routes/app.settings.tsx");
    expect(PAGE).toContain("findMerchantDoc");
    expect(PAGE).not.toMatch(/where\("shopDomain",/);
  });
});

describe("no route grows a sixth private copy", () => {
  // A merchant lookup is `collection("merchants")` plus a shop-shaped field
  // query. Anything doing that outside merchant-doc.server.ts is a private copy
  // in the making — the allowlist below is the set of deliberate exceptions,
  // each one resolving off something OTHER than a shop session.
  const ALLOWED = new Set([
    // Owned by PR #107 (feat/shopify-shipping-email-carries-the-page), which
    // deletes its private lookup. Harmless here either way.
    "app/routes/app.api.settings.branded-tracking-link.tsx",
    // Consumer-facing. Resolves the merchant off the PROOF — by ink_api_key
    // (already proven to own it), then shop_domain, then shop_id — not off a
    // shop session, so findMerchantDoc's shop-keyed search does not apply.
    "app/routes/api.verify.tsx",
    "app/routes/api.retrieve.$proofId.tsx",
  ]);

  it("every shop-keyed merchant lookup lives in merchant-doc.server.ts", async () => {
    const { globSync } = await import("node:fs");
    const files = [
      ...globSync("app/routes/*.ts"),
      ...globSync("app/routes/*.tsx"),
      ...globSync("app/services/*.ts"),
    ].filter((f) => !f.endsWith(".test.ts") && !f.endsWith("merchant-doc.server.ts"));

    const offenders = files.filter((f) => {
      const s = src(f);
      if (!s.includes('collection("merchants")')) return false;
      // Comments are prose about the landmine, not a lookup: match the code form.
      return /where\("(shop|shopDomain|shop_domain)",/.test(s);
    });

    // The sweep must actually sweep: a glob that matched nothing would make
    // this test pass while proving nothing.
    expect(files.length).toBeGreaterThan(40);
    expect(offenders).toContain("app/routes/api.verify.tsx");

    expect(offenders.filter((f) => !ALLOWED.has(f))).toEqual([]);
  });
});
