// INK'S NUMBERS AND A BOUGHT RECORD'S PACKET — both read inside the app.

import { afterEach, describe, expect, it, vi } from "vitest";
import { kpisFromBody, readInkKpis } from "./ink-kpis.server";
import { keyFromPacketUrl, packetTextFromBody, readDisputePacket } from "./ink-packet.server";

afterEach(() => vi.unstubAllEnvs());

const PROOF = "proof_aec827b527fb30457c1da890";
const KEY = `rk_${"a".repeat(64)}`;
const calls = (f: unknown) => (f as { mock: { calls: unknown[][] } }).mock.calls;

describe("the Insights KPIs", () => {
  // GET /api/merchant-insights for Corvara, as it answered on 2026-09-23.
  const BODY = { shop_id: "shop_83ffcda9b840776e", sample_size: 12, capped: false, throughput: { enrollments: 12, opened: 7, open_rate_pct: 58 }, integrity: { payload_integrity_pct: 100, geofence: { avg_distance_m: 2136, gps_count: 2, ip_count: 0 }, outcomes: { ACCEPTED: 0, UNCONFIRMED: 12, DISPUTED: 0, EXPIRED: 0, RETURNED: 0 } } };

  it("are the dashboard's own numbers, read with the merchant's own key — never the admin secret", async () => {
    vi.stubEnv("INK_ADMIN_SECRET", "admin-secret-must-not-be-sent");
    const f = vi.fn(async () => new Response(JSON.stringify(BODY))) as unknown as typeof fetch;
    expect(await readInkKpis("ink_live_merchantkey", f)).toEqual({ recorded: 12, opened: 7, openRatePct: 58, locationShared: 2, signedPct: 100, disputed: 0, capped: false });
    const [url, init] = calls(f)[0] as [string, { headers: Record<string, string> }];
    expect(url).toBe("https://us-central1-inink-c76d3.cloudfunctions.net/api/merchant-insights");
    expect(init.headers).toEqual({ Authorization: "Bearer ink_live_merchantkey" });
    expect(JSON.stringify(init)).not.toContain("admin-secret-must-not-be-sent");
  });

  it("are nothing — never an error page — without a key or an answer", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
    expect(await readInkKpis("", f)).toBeNull();
    expect(await readInkKpis(null, f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(await readInkKpis("k", f)).toBeNull();
    expect(await readInkKpis("k", vi.fn(async () => { throw new Error("timeout"); }) as unknown as typeof fetch)).toBeNull();
    expect(kpisFromBody({ nope: 1 })).toBeNull();
  });
});

describe("a bought record's dispute packet", () => {
  const BODY = {
    format: "ink.dispute-packet.v1",
    proof_id: PROOF,
    shopify_dispute_evidence: { accessActivityLog: "Opened 3 times after the order …", uncategorizedText: "The record …" },
    shopify_dispute_files: { shippingDocumentationFile: { attach: "pdf", text: "Carrier scan: delivered …" } },
    signed_source: { export: { files: { "summary.json": { buyer_name: "Made Up", street: "1 Test St" } } } },
  };

  it("takes its key from the purchase's own packet link, and only a real key", () => {
    expect(keyFromPacketUrl(`https://www.in.ink/verify/${PROOF}?key=${KEY}`)).toBe(KEY);
    for (const bad of [null, "", "not a url", `https://www.in.ink/verify/${PROOF}`, `https://www.in.ink/verify/${PROOF}?key=rk_short`]) expect(keyFromPacketUrl(bad)).toBeNull();
  });

  it("passes only the three texts Shopify's dispute form takes — never the signed export with the buyer's name and address", async () => {
    const f = vi.fn(async () => new Response(JSON.stringify(BODY))) as unknown as typeof fetch;
    const packet = await readDisputePacket(PROOF, `https://www.in.ink/verify/${PROOF}?key=${KEY}`, f);
    expect(calls(f)[0][0]).toBe(`https://us-central1-inink-c76d3.cloudfunctions.net/api/verify/${PROOF}/packet?key=${KEY}`);
    expect(packet).toEqual({ accessActivityLog: "Opened 3 times after the order …", uncategorizedText: "The record …", shippingDocumentation: "Carrier scan: delivered …" });
    expect(JSON.stringify(packet)).not.toMatch(/Made Up|1 Test St/);
  });

  it("is nothing without a valid key, or when the backend refuses it", async () => {
    const f = vi.fn(async () => new Response("{}", { status: 403 })) as unknown as typeof fetch;
    expect(await readDisputePacket(PROOF, null, f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(await readDisputePacket(PROOF, `https://www.in.ink/verify/${PROOF}?key=${KEY}`, f)).toBeNull();
    expect(packetTextFromBody({})).toBeNull();
  });
});
