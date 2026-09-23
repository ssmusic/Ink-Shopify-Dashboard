import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { recordFromBody, readRecord } from "./ink-record.server";
import { kpisFromBody } from "./ink-kpis.server";
import { merchantRead, flavorFetch } from "./ink-reader.server";
import { flavorLogger } from "./ink-log.server";
import { configureInkAccessLogging } from "../../server/ink-logging.mjs";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});
describe("ink data boundaries", () => {
  it("never follows a redirect with merchant credentials, and never sends them to a public door", async () => {
    const calls: { url: string; init?: RequestInit }[] = [];
    const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      calls.push({ url, init });
      return url.includes("/audit")
        ? new Response("", { status: 302, headers: { Location: "https://elsewhere.test" } })
        : new Response("{}", { status: 404 });
    });
    // The merchant door redirected: no record from it. (A fresh install's
    // fallback to the record's public words is the only other read, and it
    // carries no credential — services/ink-record.server.ts.)
    expect(await readRecord("proof_aaaaaaaaaaaaaaaaaaaaaaaa", f as typeof fetch, "own-key")).toBeNull();
    const audit = calls.filter((c) => c.url.includes("/proofs/proof_aaaaaaaaaaaaaaaaaaaaaaaa/audit"));
    expect(audit).toHaveLength(1);
    expect(audit[0].init).toEqual(
      expect.objectContaining({
        headers: { Authorization: "Bearer own-key" },
        redirect: "error",
        cache: "no-store",
      }),
    );
    for (const c of calls.filter((c) => !c.url.includes("/audit"))) {
      expect(new Headers(c.init?.headers).get("Authorization")).toBeNull();
    }
  });
  it("refuses unencrypted backend reads and missing credentials", async () => {
    vi.stubEnv("INK_API_URL", "http://unsafe.test/api");
    const f = vi.fn();
    expect(await merchantRead("key", "merchant-insights", f)).toBeNull();
    expect(await merchantRead(null, "merchant-insights", f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
  });
  it("also bounds ink mutation requests without changing the paid request options", async () => {
    const f = vi.fn(async () => new Response("{}"));
    vi.stubGlobal("fetch", f);
    vi.stubEnv("APP_FLAVOR", "ink");
    await expect(
      flavorFetch("http://unsafe.test/admin/purchases"),
    ).rejects.toThrow("Secure");
    expect(f).not.toHaveBeenCalled();
    const init = {
      method: "POST",
      headers: { "X-Admin-Secret": "test-only" },
      body: "{}",
    };
    await flavorFetch("https://backend.test/admin/purchases", init);
    expect(f).toHaveBeenLastCalledWith(
      "https://backend.test/admin/purchases",
      expect.objectContaining({
        ...init,
        redirect: "error",
        cache: "no-store",
        signal: expect.any(AbortSignal),
      }),
    );
    vi.stubEnv("APP_FLAVOR", "");
    await flavorFetch("https://backend.test/admin/purchases", init);
    expect(f).toHaveBeenLastCalledWith(
      "https://backend.test/admin/purchases",
      init,
    );
  });
  it("projects nested location values and drops customer identifiers and bearer links", () => {
    const body = {
      summary: {
        opens: 1,
        buyer_initials: "ZZ",
        email: "private@example.test",
      },
      verdict: {
        elements: [
          {
            element: "the_open",
            label: "The open",
            status: "verified",
            value: {
              email: "private@example.test",
              phone: "555",
              location: {
                verdict: "flagged",
                distance_m: 719,
                lat: 34,
                lng: -118,
                token: "secret-token",
                later_share: {
                  distance_m: 20,
                  lat: 33,
                  later_share: { email: "private" },
                },
              },
            },
          },
        ],
      },
      record: { locked: true, packet_url: "https://secret.test/key" },
    };
    const projected = JSON.stringify(recordFromBody(body));
    expect(projected).toContain("719");
    expect(projected).not.toMatch(
      /private|token|secret|"lat"|"lng"|phone|buyer_initials/,
    );
  });
  it("does not present missing or negative KPI fields as zero", () => {
    expect(
      kpisFromBody({ throughput: { enrollments: 0, opened: 0 } }),
    ).toBeNull();
    expect(
      kpisFromBody({
        throughput: { enrollments: -1, opened: 0 },
        integrity: { geofence: { gps_count: 0 } },
      }),
    ).toBeNull();
    expect(
      kpisFromBody({
        throughput: { enrollments: 0, opened: 0 },
        integrity: { geofence: { gps_count: 0 } },
      }),
    ).toMatchObject({ recorded: 0, opened: 0, locationShared: 0 });
  });
  it("removes error bodies, identifiers and request URLs from ink logs while retaining the paid logger", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const logger = flavorLogger("test");
    vi.stubEnv("APP_FLAVOR", "ink");
    logger.warn("buyer@example.test", new Error("secret"), { phone: "555" });
    expect(warn).toHaveBeenLastCalledWith("[ink:test] warn");
    vi.stubEnv("APP_FLAVOR", "");
    logger.warn("original", { status: 200 });
    expect(warn).toHaveBeenLastCalledWith("original", { status: 200 });
  });
  it("redacts the default HTTP access logger only under ink", () => {
    const logger = { token: vi.fn() };
    configureInkAccessLogging(false, logger);
    expect(logger.token).not.toHaveBeenCalled();
    configureInkAccessLogging(true, logger);
    const [name, token] = logger.token.mock.calls[0];
    expect(name).toBe("url");
    expect(
      token({
        originalUrl: "/app/ink?id_token=secret&shop=private.myshopify.com",
      }),
    ).toBe("[redacted]");
  });
});
