import { createHmac } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ FEATURE_NFC: false, FEATURE_NOTIFICATIONS: false }));
vi.mock("../flags", () => flags);
const session = { shop: "test-shop.myshopify.com", accessToken: "test-token" };
vi.mock("../session-utils.server", () => ({ getOfflineSession: vi.fn(), withFreshTokens: async (items: unknown[]) => items }));
vi.mock("../firestore.server", () => ({ default: {
  collection: () => ({ where: () => ({ get: async () => ({ empty: false, docs: [{ data: () => session }] }) }) }),
} }));
vi.mock("../utils/metafields.server", () => ({ INK_NAMESPACE: "ink" }));
vi.mock("./merchant-doc.server", () => ({ findMerchantDoc: async () => ({ data: { notification_settings: { delivery: { delivered: true } } } }) }));
const dispatch = vi.fn();
vi.mock("./notifications.server", () => ({ NotificationService: { dispatch } }));
const { action } = await import("../routes/ink.update");

const phone = "+15550002222";
const email = "dana@example.test";
let queries: string[];
let logs: string[];

beforeEach(() => {
  queries = [];
  logs = [];
  dispatch.mockReset();
  vi.stubEnv("APP_FLAVOR", "ritualist");
  vi.stubEnv("NFS_HMAC_SECRET", "test-hmac-key");
  for (const method of ["log", "warn", "error"] as const) vi.spyOn(console, method).mockImplementation((...args) => logs.push(JSON.stringify(args)));
  vi.stubGlobal("fetch", vi.fn(async (_url, options) => {
    const { query } = JSON.parse(options.body);
    queries.push(query);
    if (query.includes("CheckOrder")) return { json: async () => ({ data: { order: { id: "gid://shopify/Order/1234567890123" } } }) };
    if (query.includes("SetVerificationMetafields")) return { json: async () => ({ data: { metafieldsSet: { userErrors: [] } } }) };
    if (query.includes("GetOrderForNotification")) return { json: async () => ({ data: { order: { name: "#1001", customer: { email, phone, firstName: "Dana" } } } }) };
    throw new Error("Unexpected query");
  }));
});

afterEach(() => {
  flags.FEATURE_NOTIFICATIONS = false;
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

async function update() {
  const body = JSON.stringify({ order_id: "1234567890123", status: "delivered" });
  const signature = createHmac("sha256", "test-hmac-key").update(body).digest("hex");
  return action({ request: new Request("https://app.test/ink/update", { method: "POST", body, headers: { "X-INK-Signature": signature } }), params: {}, context: {} } as any);
}

describe("an inactive notification sender does not read customer contact data", () => {
  it("updates the order while skipping the contact query with notifications disabled", async () => {
    expect((await update()).status).toBe(200);
    expect(queries.some(query => query.includes("SetVerificationMetafields"))).toBe(true);
    expect(queries.some(query => query.includes("GetOrderForNotification"))).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("keeps Ink free of notification contact reads even if the Ritualist flag is enabled", async () => {
    flags.FEATURE_NOTIFICATIONS = true;
    vi.stubEnv("APP_FLAVOR", "ink");
    expect((await update()).status).toBe(200);
    expect(queries.some(query => query.includes("GetOrderForNotification"))).toBe(false);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it("preserves the enabled Ritualist sender without logging customer contact data", async () => {
    flags.FEATURE_NOTIFICATIONS = true;
    expect((await update()).status).toBe(200);
    expect(dispatch).toHaveBeenCalledWith(expect.objectContaining({ toEmail: email, toPhone: phone }), expect.anything(), expect.anything());
    expect(logs.join("\n")).not.toContain(phone);
    expect(logs.join("\n")).not.toContain(email);
  });
});
