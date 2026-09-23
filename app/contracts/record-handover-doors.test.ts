// THE $29 BUYS THE HAND-OVER — the embed's own doors (Sam, 2026-09-23;
// ink-backend #129).
//
// The merchant door now answers the WHOLE record of a priced, unbought order
// (`record: { locked: false, purchased: false, price }`), so "the packet has
// no chain" no longer means "not bought". The printed audit report is part of
// the hand-over: it answers 402 until the record is bought — for the
// merchant's whole view and for an older backend's words alike — and prints
// for a bought record and a free one.

import { beforeEach, describe, expect, it, vi } from "vitest";

const getProofAudit = vi.fn();
const buildAuditReportPdf = vi.fn(() => new Uint8Array([37, 80, 68, 70]));

vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: vi.fn(async () => ({
      session: { shop: "shop-a.myshopify.com" },
      admin: { graphql: vi.fn(async () => ({ json: async () => ({ data: { shop: { ianaTimezone: "UTC" } } }) })) },
    })),
  },
}));
vi.mock("../services/ink-api.server", () => ({ getProofAudit }));
vi.mock("../services/merchant-doc.server", () => ({ findMerchantDoc: vi.fn(async () => ({ data: { ink_api_key: "ink_live_shop_a" } })) }));
vi.mock("../firestore.server", () => ({ default: {} }));
vi.mock("../services/audit-report.server", () => ({ buildAuditReportPdf }));
vi.mock("../services/verify-url.server", () => ({ publicVerifyUrl: vi.fn(() => "https://www.in.ink/verify/x") }));

const { loader } = await import("../routes/app.api.orders.$orderId.audit-report");

const PROOF = "proof_" + "a".repeat(24);
const packet = (record?: unknown) => ({ proof_id: PROOF, summary: { order_number: "#1042" }, chain: [{ event_id: "evt_1" }], ...(record ? { record } : {}) });
const ask = () =>
  loader({ request: new Request(`https://app.example/app/api/orders/1/audit-report?proof=${PROOF}`), params: { orderId: "1" }, context: {} } as never) as Promise<Response>;

describe("the printed audit report is the hand-over", () => {
  beforeEach(() => {
    getProofAudit.mockReset();
    buildAuditReportPdf.mockClear();
  });

  it("the merchant's whole view, not bought → 402, and nothing is printed", async () => {
    getProofAudit.mockResolvedValue(packet({ locked: false, purchased: false, price_cents: 2900, currency: "USD" }));
    const r = await ask();
    expect(r.status).toBe(402);
    expect(buildAuditReportPdf).not.toHaveBeenCalled();
  });

  it("an older backend's words-only answer → 402", async () => {
    getProofAudit.mockResolvedValue({ proof_id: PROOF, summary: {}, verdict: { elements: [] }, record: { locked: true, price_cents: 2900, currency: "USD" } });
    expect((await ask()).status).toBe(402);
    expect(buildAuditReportPdf).not.toHaveBeenCalled();
  });

  it("bought → the PDF; free (no record block) → the PDF", async () => {
    getProofAudit.mockResolvedValue(packet({ locked: false, purchased: true, outcome: "open", packet_url: "https://www.in.ink/verify/x?key=k" }));
    const bought = await ask();
    expect(bought.status).toBe(200);
    expect(bought.headers.get("Content-Type")).toBe("application/pdf");
    getProofAudit.mockResolvedValue(packet());
    expect((await ask()).status).toBe(200);
    expect(buildAuditReportPdf).toHaveBeenCalledTimes(2);
  });
});
