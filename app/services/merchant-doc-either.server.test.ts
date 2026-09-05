// findMerchantDocRefByEither — the warehouse/PWA shape, where a JWT may carry
// shopDomain, merchant_id, or both, and either one must still land on the
// doc the fulfilment webhook reads. See merchant-doc.server.ts's own header
// for why this exists (§17.2 landmine, appearances six and seven).

import { describe, expect, it } from "vitest";
import { findMerchantDocRefByEither } from "./merchant-doc.server";

type Doc = { id: string; data: Record<string, unknown> };

/** Same minimal firestore stub as merchant-doc-ref.server.test.ts. */
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
  } as any;
}

describe("findMerchantDocRefByEither", () => {
  it("resolves via merchant_id (a backend JWT's id IS the doc id) even with no shopDomain", async () => {
    const fs = stubFirestore([
      { id: "shop_abc123", data: { shop_domain: "corvara.myshopify.com", ink_api_key: "k1" } },
    ]);
    const hit = await findMerchantDocRefByEither(fs, { merchantId: "shop_abc123" });
    expect(hit?.ref.id).toBe("shop_abc123");
    expect(hit?.apiKey).toBe("k1");
  });

  it("resolves via shopDomain when merchant_id is absent", async () => {
    const fs = stubFirestore([
      { id: "sm-test.myshopify.com", data: { shop: "sm-test.myshopify.com", ink_api_key: "k2" } },
    ]);
    const hit = await findMerchantDocRefByEither(fs, { shopDomain: "sm-test.myshopify.com" });
    expect(hit?.ref.id).toBe("sm-test.myshopify.com");
  });

  it("THE TWO-DOC SHAPE: merchant_id names the wrong (keyless) doc, shopDomain finds the real one", async () => {
    // Mirrors the measured shape from #107: a domain-keyed doc with no key,
    // and a random-id doc that carries it. A caller might hand us the
    // domain-keyed id as "merchant_id" (a stale cache, an old token) — that
    // candidate alone resolves to the SAME doc via the field fallback inside
    // findMerchantDocRef, so it still finds the keyed doc, not nothing.
    const fs = stubFirestore([
      { id: "smusic-official.myshopify.com", data: { shop: "smusic-official.myshopify.com" } },
      {
        id: "PWXStzc7mP8hn33xPbNf",
        data: { shop_domain: "smusic-official.myshopify.com", ink_api_key: "real_key" },
      },
    ]);
    const hit = await findMerchantDocRefByEither(fs, {
      merchantId: "smusic-official.myshopify.com",
      shopDomain: "smusic-official.myshopify.com",
    });
    expect(hit?.ref.id).toBe("PWXStzc7mP8hn33xPbNf");
    expect(hit?.apiKey).toBe("real_key");
  });

  it("a merchant_id that resolves to a keyless doc doesn't stop shopDomain from finding the real one", async () => {
    // The merchant_id happens to name a DIFFERENT, keyless doc for this shop
    // (a stale cache, a doc created before provisioning finished) — the
    // shopDomain candidate still gets tried, and its doc carries the key.
    const fs = stubFirestore([
      { id: "shop_stale", data: { shop_domain: "corvara.myshopify.com" } },
      { id: "corvara.myshopify.com", data: { shop: "corvara.myshopify.com", ink_api_key: "real_key" } },
    ]);
    const hit = await findMerchantDocRefByEither(fs, {
      merchantId: "shop_stale",
      shopDomain: "corvara.myshopify.com",
    });
    expect(hit?.ref.id).toBe("corvara.myshopify.com");
    expect(hit?.apiKey).toBe("real_key");
  });

  it("falls back to a keyless hit when NEITHER identifier finds a key — still returns a doc, not nothing", async () => {
    const fs = stubFirestore([{ id: "shop_stale", data: { shop_domain: "ghost.myshopify.com" } }]);
    const hit = await findMerchantDocRefByEither(fs, {
      merchantId: "shop_stale",
      shopDomain: "ghost.myshopify.com",
    });
    expect(hit?.ref.id).toBe("shop_stale");
    expect(hit?.apiKey).toBeNull();
  });

  it("returns null when neither identifier is present", async () => {
    const hit = await findMerchantDocRefByEither(stubFirestore([]), {});
    expect(hit).toBeNull();
  });

  it("returns null when both identifiers are given but nothing matches", async () => {
    const hit = await findMerchantDocRefByEither(stubFirestore([]), {
      merchantId: "ghost_id",
      shopDomain: "ghost.myshopify.com",
    });
    expect(hit).toBeNull();
  });
});
