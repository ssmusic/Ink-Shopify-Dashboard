import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const f = vi.hoisted(() => ({
  loginUser: vi.fn(), createMerchant: vi.fn(), collection: vi.fn(),
  get: vi.fn(), compare: vi.fn(),
}));
vi.mock("./ink-api.server", () => ({ loginUser: f.loginUser, createMerchant: f.createMerchant }));
vi.mock("../firestore.server", () => ({ default: { collection: f.collection } }));
vi.mock("bcryptjs", () => ({ default: { compare: f.compare } }));

let action: typeof import("../routes/app.api.auth.login").action;
async function login(body: unknown, ip = "192.0.2.1") {
  return action({ request: new Request("https://example.test/app/api/auth/login", {
    method: "POST", headers: { "Content-Type": "application/json", "x-forwarded-for": ip },
    body: JSON.stringify(body),
  }), params: {}, context: {} } as never);
}

beforeEach(async () => {
  vi.resetModules();
  vi.clearAllMocks();
  vi.stubEnv("WAREHOUSE_JWT_SECRET", "fixture-signing-secret-not-production");
  f.collection.mockReturnValue({ where: () => ({ limit: () => ({ get: f.get }) }) });
  f.get.mockResolvedValue({ empty: true, docs: [] });
  f.loginUser.mockResolvedValue({ token: "fixture-token", user: { user_id: "user_fixture", merchant_id: "shop_fixture", email: "user@example.test" } });
  action = (await import("../routes/app.api.auth.login")).action;
});
afterEach(() => vi.unstubAllEnvs());

describe("warehouse login does not provision merchants", () => {
  it("authenticates an existing backend user without rotating or writing shared merchant credentials", async () => {
    const response = await login({ email: " USER@EXAMPLE.TEST ", password: "fixture-password" });
    expect(response.status).toBe(200);
    expect((await response.json()).token).toBe("fixture-token");
    expect(f.loginUser).toHaveBeenCalledWith("user@example.test", "fixture-password");
    expect(f.createMerchant).not.toHaveBeenCalled();
    expect(f.collection).not.toHaveBeenCalled();
  });

  it("keeps legacy authentication read-only, even when no merchant key is cached", async () => {
    f.loginUser.mockRejectedValue(new Error("primary unavailable"));
    f.get.mockResolvedValue({ empty: false, docs: [{ id: "legacy-user", data: () => ({
      email: "user@example.test", shopDomain: "example.myshopify.com", passwordHash: "fixture-hash", role: "warehouse",
    }) }] });
    f.compare.mockResolvedValue(true);
    const response = await login({ email: "user@example.test", password: "fixture-password" });
    expect(response.status).toBe(200);
    expect((await response.json()).token.split(".")).toHaveLength(3);
    expect(f.collection.mock.calls).toEqual([["warehouse_users"]]);
    expect(f.createMerchant).not.toHaveBeenCalled();
  });
});

describe("warehouse credential attempts are bounded", () => {
  it.each([null, [], { email: {}, password: "x" }, { email: "user@example.test", password: [] }, { email: "user@example.test", password: "x".repeat(1025) }])("rejects malformed credentials before either credential store", async (body) => {
    expect((await login(body)).status).toBe(400);
    expect(f.loginUser).not.toHaveBeenCalled();
    expect(f.collection).not.toHaveBeenCalled();
  });

  it("limits the same normalized account even when caller changes its forwarded IP", async () => {
    f.loginUser.mockRejectedValue(new Error("invalid credentials"));
    for (let i = 0; i < 10; i++) {
      expect((await login({ email: i % 2 ? "USER@EXAMPLE.TEST" : " user@example.test ", password: "bad" }, `192.0.2.${i + 1}`)).status).toBe(401);
    }
    const blocked = await login({ email: "user@example.test", password: "bad" }, "192.0.2.50");
    expect(blocked.status).toBe(429);
    expect(blocked.headers.get("Retry-After")).toBe("60");
    expect(blocked.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(f.loginUser).toHaveBeenCalledTimes(10);
    expect(f.get).toHaveBeenCalledTimes(10);
  });

  it("limits a single IP trying different account names", async () => {
    f.loginUser.mockRejectedValue(new Error("invalid credentials"));
    for (let i = 0; i < 30; i++) await login({ email: `user${i}@example.test`, password: "bad" });
    expect((await login({ email: "another@example.test", password: "bad" })).status).toBe(429);
    expect(f.loginUser).toHaveBeenCalledTimes(30);
  });
});
