import { afterEach, describe, expect, it, vi } from "vitest";
import { NFSService } from "./nfs.server";

afterEach(() => { vi.restoreAllMocks(); vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("ink tracking transport", () => {
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
