import { afterEach, beforeEach, expect, it, vi } from "vitest";

const processPendingPrivacy = vi.fn();
const verifyIdToken = vi.fn();
vi.mock("./ink-privacy.server", () => ({ processPendingPrivacy }));
vi.mock("google-auth-library", () => ({ OAuth2Client: class { verifyIdToken = verifyIdToken; } }));
const { loader } = await import("../routes/api.jobs.privacy");

beforeEach(() => {
  vi.stubEnv("PRIVACY_JOB_SERVICE_ACCOUNT", "privacy-jobs@example.iam.gserviceaccount.com");
  vi.stubEnv("PRIVACY_JOB_AUDIENCE", "https://app.example.test");
  verifyIdToken.mockReset().mockResolvedValue({
    getPayload: () => ({ email: "privacy-jobs@example.iam.gserviceaccount.com", email_verified: true }),
  });
  processPendingPrivacy.mockReset().mockResolvedValue({ processed: 1, failed: 0 });
});
afterEach(() => vi.unstubAllEnvs());

const call = (token?: string) => loader({
  request: new Request("https://app.test/api/jobs/privacy", {
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  }),
} as any);

it("refuses an unauthenticated worker call before reading requests", async () => {
  expect((await call()).status).toBe(401);
  verifyIdToken.mockRejectedValueOnce(new Error("bad token"));
  expect((await call("wrong")).status).toBe(401);
  expect(processPendingPrivacy).not.toHaveBeenCalled();
});

it("processes a queued deletion with the configured secret", async () => {
  const result = await call("signed-token");
  expect(result.status).toBe(200);
  expect(await result.json()).toEqual({ processed: 1, failed: 0 });
  expect(verifyIdToken).toHaveBeenCalledWith({ idToken: "signed-token", audience: "https://app.example.test" });
});
