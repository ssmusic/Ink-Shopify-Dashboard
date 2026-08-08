// findMerchantDocRef — the resolver the Notifications API needed and didn't have.
//
// findMerchantDoc returns DATA; the settings API must WRITE, so it needs the
// ref. The old route's private lookup knew two conventions (doc-by-merchant_id,
// where("shopDomain"==…)) and missed the one the embed actually provisions:
// doc id = shop domain. Same landmine class as Bible §17.2, fourth appearance.
// The ref variant reuses the one resolver instead of forking a fifth.

import { describe, expect, it } from "vitest";
import { findMerchantDocRef } from "./merchant-doc.server";

type Doc = { id: string; data: Record<string, unknown> };

/** Minimal firestore stub speaking the exact surface the resolver uses. */
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
              return {
                exists: Boolean(hit),
                data: () => hit?.data,
                ref,
              };
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

describe("findMerchantDocRef", () => {
  it("resolves the embed's own shape — doc id IS the shop domain", async () => {
    const fs = stubFirestore([
      { id: "sm-test.myshopify.com", data: { shop: "sm-test.myshopify.com", ink_api_key: "k1" } },
    ]);
    const hit = await findMerchantDocRef(fs, "sm-test.myshopify.com");
    expect(hit).not.toBeNull();
    expect(hit!.ref.id).toBe("sm-test.myshopify.com");
    expect(hit!.apiKey).toBe("k1");
  });

  it("falls back through the field conventions (shop_domain, backend shape)", async () => {
    const fs = stubFirestore([
      { id: "shop_abc123", data: { shop_domain: "corvara.myshopify.com", ink_api_key: "k2" } },
    ]);
    const hit = await findMerchantDocRef(fs, "corvara.myshopify.com");
    expect(hit).not.toBeNull();
    expect(hit!.ref.id).toBe("shop_abc123");
  });

  it("prefers the doc that carries ink_api_key when several match", async () => {
    const fs = stubFirestore([
      { id: "stub", data: { shopDomain: "x.myshopify.com" } },
      { id: "real", data: { shopDomain: "x.myshopify.com", ink_api_key: "k3" } },
    ]);
    const hit = await findMerchantDocRef(fs, "x.myshopify.com");
    expect(hit!.ref.id).toBe("real");
    expect(hit!.apiKey).toBe("k3");
  });

  it("returns null for a shop nothing knows — the caller decides, not a guess", async () => {
    const hit = await findMerchantDocRef(stubFirestore([]), "ghost.myshopify.com");
    expect(hit).toBeNull();
  });
});
