// findActivationDocRef — the slice reads the record the workspace writes.
//
// A connected store can hold TWO merchant docs: the embed's own (keyed by
// shop domain, carrying ink_api_key) and the backend-provisioned one
// (`shop_…`, `status: "active"`). The backend's PATCH /activation-scope can
// only write the ACTIVE doc, so a webhook reading the slice off the api-key
// doc sees null forever — a saved slice silently ignored. Caught on the
// Steve Madden rig 2026-08-28. These tests pin the choice.

import { describe, expect, it } from "vitest";
import { findActivationDocRef } from "./merchant-doc.server";

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

describe("findActivationDocRef", () => {
  it("the two-record store: prefers the ACTIVE doc over the api-key doc (the Steve Madden shape)", async () => {
    const fs = stubFirestore([
      {
        id: "sm-test.myshopify.com",
        data: {
          shop: "sm-test.myshopify.com",
          shopDomain: "sm-test.myshopify.com",
          ink_api_key: "k1",
        },
      },
      {
        id: "shop_bb508e",
        data: {
          shop_id: "shop_bb508e",
          shop_domain: "sm-test.myshopify.com",
          status: "active",
        },
      },
    ]);
    const hit = await findActivationDocRef(fs, "sm-test.myshopify.com");
    expect(hit).not.toBeNull();
    expect(hit!.ref.id).toBe("shop_bb508e");
    // The api key is still reported from whichever doc carries it.
    expect(hit!.apiKey).toBe("k1");
  });

  it("a single-doc shop resolves exactly as before (no active flag, api-key doc wins)", async () => {
    const fs = stubFirestore([
      { id: "solo.myshopify.com", data: { shop: "solo.myshopify.com", ink_api_key: "k2" } },
    ]);
    const hit = await findActivationDocRef(fs, "solo.myshopify.com");
    expect(hit).not.toBeNull();
    expect(hit!.ref.id).toBe("solo.myshopify.com");
    expect(hit!.apiKey).toBe("k2");
  });

  it("with no active doc, a doc already carrying a slice beats the api-key doc", async () => {
    const fs = stubFirestore([
      { id: "keyed", data: { shopDomain: "y.myshopify.com", ink_api_key: "k3" } },
      {
        id: "sliced",
        data: {
          shop_domain: "y.myshopify.com",
          activation_scope: { ship_to: { states: ["CA"] } },
        },
      },
    ]);
    const hit = await findActivationDocRef(fs, "y.myshopify.com");
    expect(hit).not.toBeNull();
    expect(hit!.ref.id).toBe("sliced");
  });

  it("a doc matched by the direct read AND a field query is counted once", async () => {
    const fs = stubFirestore([
      {
        id: "z.myshopify.com",
        data: { shop: "z.myshopify.com", shopDomain: "z.myshopify.com", ink_api_key: "k4" },
      },
    ]);
    const hit = await findActivationDocRef(fs, "z.myshopify.com");
    expect(hit).not.toBeNull();
    expect(hit!.ref.id).toBe("z.myshopify.com");
  });

  it("an unknown shop resolves to null", async () => {
    const fs = stubFirestore([]);
    const hit = await findActivationDocRef(fs, "ghost.myshopify.com");
    expect(hit).toBeNull();
  });
});
