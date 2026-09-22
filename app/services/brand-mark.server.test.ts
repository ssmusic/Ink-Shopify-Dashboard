// THE CAPTURE CALL, AGAINST A FETCH STUB — the door's shape, and every way
// it can fail without taking the install with it.
//
// The Worker door (the-ritualist worker-recovered/src/brand-mark-door.js)
// takes POST /admin/brand-mark behind X-Admin-Password; this build run
// teaches it `site` (book-less) and `write: "merchant"`. The client here
// sends exactly that and nothing else, and NEVER throws: this runs inside
// the install's fire-and-forget provision.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { brandMarkDoorUrl, captureBrandMark, logoUrlFromCaptureBody } from "./brand-mark.server";

const fetchMock = vi.fn();

function answer(status: number, body: unknown) {
  fetchMock.mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  });
}

function lastCall(): { url: string; init: RequestInit } {
  const [url, init] = fetchMock.mock.calls.at(-1) as [string, RequestInit];
  return { url, init };
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubEnv("INK_WORKER_URL", "https://worker.test/");
  vi.stubEnv("INK_WORKER_ADMIN_PW", "operator-password");
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("the door's address", () => {
  it("is the Worker's origin plus /admin/brand-mark, one slash between", () => {
    expect(brandMarkDoorUrl()).toBe("https://worker.test/admin/brand-mark");
  });

  it("is nothing when the Worker is not configured", () => {
    vi.stubEnv("INK_WORKER_URL", "");
    expect(brandMarkDoorUrl()).toBeNull();
  });
});

describe("captureBrandMark", () => {
  it("POSTs { site, shop_id, write: 'merchant' } behind X-Admin-Password", async () => {
    answer(200, { brand_logo_url: "https://cdn.test/marks/brand.svg" });

    const out = await captureBrandMark({
      site: "https://www.example-brand.test/",
      shopId: "shop_0123456789abcdef",
      fetchImpl: fetchMock as unknown as typeof fetch,
    });

    const { url, init } = lastCall();
    expect(url).toBe("https://worker.test/admin/brand-mark");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>)["X-Admin-Password"]).toBe("operator-password");
    expect((init.headers as Record<string, string>)["Content-Type"]).toBe("application/json");
    expect(JSON.parse(String(init.body))).toEqual({
      site: "https://www.example-brand.test/",
      shop_id: "shop_0123456789abcdef",
      write: "merchant",
    });
    expect(out).toMatchObject({ ok: true, status: 200, logoUrl: "https://cdn.test/marks/brand.svg" });
  });

  it("reads the mark from the book-shaped answer too (logo.primary_url)", async () => {
    answer(200, { wrote: true, logo: { primary_url: "https://cdn.test/marks/hosted.png", sources: ["rehosted"] } });
    const out = await captureBrandMark({ site: "https://x.test", shopId: "shop_1", fetchImpl: fetchMock as any });
    expect(out.ok).toBe(true);
    expect(out.logoUrl).toBe("https://cdn.test/marks/hosted.png");
  });

  it("says so when the Worker answered but found no mark — the screen then sets the name in type", async () => {
    answer(200, { candidates: [], pick: null });
    const out = await captureBrandMark({ site: "https://x.test", shopId: "shop_1", fetchImpl: fetchMock as any });
    expect(out.ok).toBe(true);
    expect(out.logoUrl).toBeNull();
    expect(out.note).toMatch(/named no mark/);
  });

  it("carries the Worker's own sentence on a refusal, and does not throw", async () => {
    answer(404, { error: "no mark could be found for this brand" });
    const out = await captureBrandMark({ site: "https://x.test", shopId: "shop_1", fetchImpl: fetchMock as any });
    expect(out).toMatchObject({ ok: false, status: 404, logoUrl: null });
    expect(out.note).toContain("no mark could be found for this brand");
  });

  it("survives a Worker that is down", async () => {
    fetchMock.mockRejectedValue(new TypeError("fetch failed"));
    const out = await captureBrandMark({ site: "https://x.test", shopId: "shop_1", fetchImpl: fetchMock as any });
    expect(out).toMatchObject({ ok: false, status: 0, logoUrl: null });
    expect(out.note).toContain("fetch failed");
  });

  it("survives an answer that is not JSON", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 502, json: async () => { throw new SyntaxError("bad"); } });
    const out = await captureBrandMark({ site: "https://x.test", shopId: "shop_1", fetchImpl: fetchMock as any });
    expect(out).toMatchObject({ ok: false, status: 502, logoUrl: null });
    expect(out.note).toContain("HTTP 502");
  });

  it("never calls out when the Worker is not configured — the Ritualist's service has neither var", async () => {
    vi.stubEnv("INK_WORKER_URL", "");
    vi.stubEnv("INK_WORKER_ADMIN_PW", "");
    const out = await captureBrandMark({ site: "https://x.test", shopId: "shop_1", fetchImpl: fetchMock as any });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out).toMatchObject({ ok: false, status: -1, logoUrl: null });
    expect(out.note).toMatch(/not configured/);
  });

  it("never calls out without a site or a shop_id", async () => {
    const out = await captureBrandMark({ site: "", shopId: "shop_1", fetchImpl: fetchMock as any });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(out.ok).toBe(false);
  });
});

describe("logoUrlFromCaptureBody", () => {
  it("prefers the merchant write's field, falls back to the book's, and returns null for neither", () => {
    expect(logoUrlFromCaptureBody({ brand_logo_url: " https://a.test/m.svg " })).toBe("https://a.test/m.svg");
    expect(logoUrlFromCaptureBody({ logo: { primary_url: "https://b.test/m.png" } })).toBe("https://b.test/m.png");
    expect(logoUrlFromCaptureBody({ brand_logo_url: "", logo: { primary_url: "" } })).toBeNull();
    expect(logoUrlFromCaptureBody(null)).toBeNull();
  });
});
