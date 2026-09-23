import { afterEach, describe, expect, it, vi } from "vitest";
import { NFSService } from "./nfs.server";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("ink tracking transport", () => {
  it("keeps the original destination through repeated Shopify link echoes", async () => {
    vi.stubEnv("APP_FLAVOR", "ink");
    let storedUrl: string | undefined;
    const bodies: Record<string, unknown>[] = [];
    vi.stubGlobal("fetch", vi.fn(async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body));
      bodies.push(body);
      // The existing backend updates tracking_url only when supplied.
      if (body.tracking_url) storedUrl = body.tracking_url;
      return new Response(JSON.stringify({ shippo_registered: true }));
    }));
    const original = "https://tracking.example.test/parcels/ABC?source=shipping&ref=x%2Fy#events";
    const payload = { tracking_number: "ABC", carrier_name: "Carrier", tracking_url: original };
    await NFSService.updateTracking("proof_aaaaaaaaaaaaaaaaaaaaaaaa", "own-key", payload);
    for (const tracking_url of ["https://brand.in.ink/r/nfc_sample", "http://www.in.ink/r/nfc_sample", "https://IN.INK./r/nfc_sample"]) {
      await NFSService.updateTracking("proof_aaaaaaaaaaaaaaaaaaaaaaaa", "own-key", {
        ...payload, tracking_url, shipment_status: "in_transit",
      });
      expect(storedUrl).toBe(original);
      expect(bodies.at(-1)).not.toHaveProperty("tracking_url");
      expect(bodies.at(-1)).toMatchObject({ tracking_number: "ABC", carrier_name: "Carrier", shipment_status: "in_transit" });
    }
    expect(payload.tracking_url).toBe(original);
    const changed = "https://merchant.example.test/track/ABC";
    await NFSService.updateTracking("proof_aaaaaaaaaaaaaaaaaaaaaaaa", "own-key", { ...payload, tracking_url: changed });
    expect(storedUrl).toBe(changed);
  });
  it.each(["", "not a URL", "javascript:alert(1)", "data:text/html,example", "https://user:password@tracking.example.test"]) (
    "does not save an unusable or credential-bearing destination: %s", async tracking_url => {
      vi.stubEnv("APP_FLAVOR", "ink");
      const f = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response("{}"));
      vi.stubGlobal("fetch", f);
      await NFSService.updateTracking("proof_aaaaaaaaaaaaaaaaaaaaaaaa", "own-key", { tracking_number: "ABC", tracking_url });
      expect(JSON.parse(String(f.mock.calls[0][1]?.body))).toEqual({ tracking_number: "ABC" });
    },
  );
  it("leaves the Ritualist tracking request body byte-identical", async () => {
    vi.stubEnv("APP_FLAVOR", "");
    vi.spyOn(console, "log").mockImplementation(() => {});
    const f = vi.fn(async (_url: unknown, _init?: RequestInit) => new Response("{}"));
    vi.stubGlobal("fetch", f);
    const payload = { tracking_number: "ABC", tracking_url: "https://brand.in.ink/r/nfc_sample", shipment_status: "delivered" };
    await NFSService.updateTracking("proof_aaaaaaaaaaaaaaaaaaaaaaaa", "own-key", payload);
    expect(f.mock.calls[0][1]?.body).toBe(JSON.stringify(payload));
  });
  it("does not log tracking payloads or raw backend responses", async () => {
    vi.stubEnv("APP_FLAVOR", "ink");
    const logs = vi.spyOn(console, "log").mockImplementation(() => {});
    const f = vi.fn(async () => new Response(JSON.stringify({ customer_email: "private@example.test", shipping_address: "private address" })));
    vi.stubGlobal("fetch", f);
    await NFSService.updateTracking("proof_aaaaaaaaaaaaaaaaaaaaaaaa", "private-key", { tracking_number: "PRIVATE-TRACKING" });
    await NFSService.markDelivered("proof_aaaaaaaaaaaaaaaaaaaaaaaa", "private-key", { delivered_at: "2026-09-23T10:00:00Z" });
    expect(JSON.stringify(logs.mock.calls)).not.toMatch(/PRIVATE|private|proof_/);
    expect(f.mock.calls[0]).toEqual([expect.stringMatching(/^https:/), expect.objectContaining({ redirect: "error", signal: expect.any(AbortSignal) })]);
  });
});
