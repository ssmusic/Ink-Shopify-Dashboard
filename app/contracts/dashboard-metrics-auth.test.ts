import { describe, expect, it, vi } from "vitest";

vi.mock("../shopify.server", () => ({
  authenticate: {
    admin: vi.fn(async () => { throw new Error("session token missing"); }),
  },
}));
vi.mock("../session-utils.server", () => ({ getOfflineSession: vi.fn() }));

import { loader } from "../routes/app.api.dashboard.metrics";

describe("dashboard metrics authentication", () => {
  it("does not return a successful response or disclose exception details without Shopify auth", async () => {
    const response = await loader({
      request: new Request("https://app.in.ink/app/api/dashboard/metrics"),
      params: {}, context: {},
    } as any);

    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({ error: "Unauthorized or missing token context" });
  });
});
