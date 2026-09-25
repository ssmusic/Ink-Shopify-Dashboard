// WHERE THE TRACKING LINK GOES — the app's server (2026-09-25). Pinned: the
// view reads the record as the backend does (default vs chosen, by plan);
// each choice writes exactly its dials to the session's shop; the
// Ritualist-page choices only on the Ritualist's plan; a word that is not a
// choice writes nothing; a refusal is said, never a false "saved".
import { describe, expect, it, vi } from "vitest";

vi.mock("../firestore.server", () => ({ default: {} }));
vi.mock("./merchant.server", () => ({ getMerchant: vi.fn() }));
vi.mock("./ink-install.server", () => ({ resolveInkShopId: vi.fn() }));
vi.mock("./ink-api.server", () => ({ patchMerchant: vi.fn() }));

const { readBuyerDoor, saveBuyerDoor } = await import("./buyer-door-choice.server");
const { BUYER_DOOR_CHOICE_DIALS, buyerDoorView } = await import("../lib/buyer-door-choice");

function deps(record: Record<string, unknown> | null, patch?: (f: Record<string, unknown>) => Record<string, unknown>) {
  const writes: Array<[string, Record<string, unknown>]> = [];
  return {
    writes,
    deps: {
      shopIdOf: async () => "shop_A",
      readRecord: async () => record,
      patch: async (id: string, fields: Record<string, string | null>) => {
        writes.push([id, fields]);
        if (patch) return patch(fields);
        return { ...(record ?? {}), ...fields };
      },
    },
  };
}

describe("the view", () => {
  it("no dial written: the plan decides, and says so", () => {
    expect(buyerDoorView({ plan: "ink" })).toMatchObject({ choice: "ask_order_status", source: "default", choices: ["ask_order_status", "ask_carrier"] });
    expect(buyerDoorView({})).toMatchObject({ plan: "ritualist", choice: "ritualist_page", source: "default" });
    expect(buyerDoorView({}).choices).toEqual(["ask_order_status", "ask_ritualist_page", "ask_carrier", "ritualist_page"]);
  });
  it("a written dial is a choice; the mark flash set by hand is none of the four", () => {
    expect(buyerDoorView({ page_mode: "flash", flash_face: "white", flash_forward: "page" })).toMatchObject({ choice: "ask_ritualist_page", source: "chosen" });
    expect(buyerDoorView({ plan: "ink", flash_forward: "carrier" })).toMatchObject({ choice: "ask_carrier", source: "chosen" });
    expect(buyerDoorView({ page_mode: "flash" })).toMatchObject({ choice: null, face: "mark", forward: "order_status" });
    expect(buyerDoorView({ page_mode: "sideways" })).toMatchObject({ choice: "ritualist_page", source: "default" });
  });
});

describe("the server", () => {
  it("reads the session's store", async () => {
    const { deps: d } = deps({ page_mode: "flash", flash_face: "white" });
    expect(await readBuyerDoor("s.myshopify.com", d)).toEqual({ ok: true, view: expect.objectContaining({ choice: "ask_order_status", source: "chosen" }) });
  });

  it("a store the backend does not know yet says so", async () => {
    const { deps: d } = deps(null);
    expect(await readBuyerDoor("s.myshopify.com", d)).toMatchObject({ ok: false });
  });

  it("each choice writes exactly its dials, and answers with the record after the write", async () => {
    for (const [choice, dials] of Object.entries(BUYER_DOOR_CHOICE_DIALS)) {
      const { deps: d, writes } = deps({});
      const out = await saveBuyerDoor("s.myshopify.com", choice, d);
      expect(writes).toEqual([["shop_A", dials]]);
      expect(out).toMatchObject({ ok: true, view: { choice, source: "chosen" } });
    }
  });

  it("the Ritualist page is not a choice on ink's plan; a stray word writes nothing", async () => {
    for (const choice of ["ritualist_page", "ask_ritualist_page", "carrier", null]) {
      const { deps: d, writes } = deps({ plan: "ink" });
      expect(await saveBuyerDoor("s.myshopify.com", choice, d)).toMatchObject({ ok: false });
      expect(writes).toEqual([]);
    }
  });

  it("a backend refusal is said, never a false saved", async () => {
    const { deps: d } = deps({}, () => {
      throw new Error("Failed to update merchant: flash_forward must be one of: order_status, carrier");
    });
    const out = await saveBuyerDoor("s.myshopify.com", "ask_ritualist_page", d);
    expect(out).toMatchObject({ ok: false });
    expect(!out.ok && out.error).toMatch(/flash_forward must be one of/);
  });
});
