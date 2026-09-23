import { describe, expect, it, vi } from "vitest";

const source = [
  { shop: "one.myshopify.com", proofId: "proof_aaaaaaaaaaaaaaaaaaaaaaaa", orderName: "#101", state: "minted", createdAt: "2025-01-01T00:00:00.000Z", chargeId: "private" },
  { shop: "one.myshopify.com", proofId: "proof_bbbbbbbbbbbbbbbbbbbbbbbb", state: "pending", createdAt: "2026-01-01T00:00:00.000Z", confirmationUrl: "https://private.example" },
  { shop: "two.myshopify.com", proofId: "proof_cccccccccccccccccccccccc", state: "minted", createdAt: "2026-02-01T00:00:00.000Z" },
  { shop: "one.myshopify.com", proofId: "bad", state: "minted", createdAt: "2026-03-01T00:00:00.000Z" },
  { shop: "one.myshopify.com", proofId: "proof_dddddddddddddddddddddddd", state: "declined", createdAt: "2026-04-01T00:00:00.000Z" },
];
const where = vi.fn((_field: string, _op: string, shop: string) => ({
  get: async () => ({ docs: source.filter((row) => row.shop === shop).map((row) => ({ data: () => row })) }),
}));
vi.mock("../firestore.server", () => ({ default: { collection: () => ({ where }) } }));
const { readInkRecordHistory } = await import("./ink-record-history.server");

describe("ink record history", () => {
  it("returns old purchases and pending approvals only for the authenticated shop", async () => {
    const history = await readInkRecordHistory("one.myshopify.com", 1);
    expect(where).toHaveBeenCalledWith("shop", "==", "one.myshopify.com");
    expect(history.rows.map((row) => row.proofId)).toEqual([
      "proof_bbbbbbbbbbbbbbbbbbbbbbbb",
      "proof_aaaaaaaaaaaaaaaaaaaaaaaa",
    ]);
    expect(JSON.stringify(history)).not.toMatch(/private|confirmationUrl|chargeId|cccccccc|dddddddd/);
    expect(history.rows[1].orderName).toBe("#101");
  });
  it("clamps out-of-range pages without losing the purchase", async () => {
    expect((await readInkRecordHistory("one.myshopify.com", 99)).rows).toHaveLength(2);
    expect((await readInkRecordHistory("one.myshopify.com", -1)).page).toBe(1);
  });
});
