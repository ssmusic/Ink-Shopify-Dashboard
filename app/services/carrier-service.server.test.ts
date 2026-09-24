// THE CARRIER SERVICE LOSES "VERIFIED" (Sam, 2026-09-24, on the service
// named "ink. Verified Delivery": "wrong"). A shop that holds the old name is
// renamed in place through the carrierServiceUpdate the app already makes on
// every load — never a second service beside it — and a refused rename never
// costs the deactivation. The new name is PLACEHOLDER; the shape is pinned.
import { describe, expect, it, vi } from "vitest";
import {
  CARRIER_SERVICE_NAME,
  LEGACY_CARRIER_SERVICE_NAMES,
  ensureCarrierServiceRegistered,
  isInkCarrierServiceName,
  setCarrierServiceActive,
} from "./carrier-service.server";

const APP = "https://shopify-app.example";
const CALLBACK = `${APP}/api/shipping-rates`;

type Service = { id: string; name: string; active: boolean; callbackUrl: string };

function adminWith(services: Service[], refuseName = false) {
  const calls: Array<{ query: string; input?: Record<string, unknown> }> = [];
  const graphql = vi.fn(async (query: string, opts?: { variables?: { input?: Record<string, unknown> } }) => {
    const input = opts?.variables?.input;
    calls.push({ query, input });
    if (/carrierServices\(first/.test(query)) {
      return { json: async () => ({ data: { carrierServices: { edges: services.map((node) => ({ node })) } } }) };
    }
    if (/carrierServiceUpdate\(/.test(query)) {
      const errors = refuseName && input && "name" in input ? [{ field: ["name"], message: "refused" }] : [];
      return { json: async () => ({ data: { carrierServiceUpdate: { carrierService: null, userErrors: errors } } }) };
    }
    if (/carrierServiceCreate\(/.test(query)) {
      return { json: async () => ({ data: { carrierServiceCreate: { carrierService: { id: "gid://new", name: input?.name }, userErrors: [] } } }) };
    }
    throw new Error(`unexpected query: ${query.slice(0, 60)}`);
  });
  return { admin: { graphql }, calls };
}

const updates = (calls: Array<{ query: string; input?: Record<string, unknown> }>) =>
  calls.filter((c) => /carrierServiceUpdate\(/.test(c.query)).map((c) => c.input);

describe("the carrier service's name", () => {
  it("says no verdict, and still knows the old one", () => {
    expect(CARRIER_SERVICE_NAME).not.toMatch(/verif|confirm/i);
    expect(LEGACY_CARRIER_SERVICE_NAMES).toContain("ink. Verified Delivery");
    expect(isInkCarrierServiceName("ink. Verified Delivery")).toBe(true);
    expect(isInkCarrierServiceName(CARRIER_SERVICE_NAME)).toBe(true);
    expect(isInkCarrierServiceName("UPS")).toBe(false);
  });
});

describe("ensureCarrierServiceRegistered", () => {
  it("renames a shop's old service in place, off and pointed at the callback, with no second service", async () => {
    const { admin, calls } = adminWith([{ id: "gid://cs/1", name: "ink. Verified Delivery", active: false, callbackUrl: CALLBACK }]);
    await ensureCarrierServiceRegistered(admin, APP);
    expect(updates(calls)).toEqual([{ id: "gid://cs/1", name: CARRIER_SERVICE_NAME, callbackUrl: CALLBACK, active: false }]);
    expect(calls.some((c) => /carrierServiceCreate\(/.test(c.query))).toBe(false);
  });

  it("keeps the deactivation when Shopify refuses the rename", async () => {
    const { admin, calls } = adminWith([{ id: "gid://cs/1", name: "ink. Verified Delivery", active: true, callbackUrl: CALLBACK }], true);
    await ensureCarrierServiceRegistered(admin, APP);
    expect(updates(calls)).toEqual([
      { id: "gid://cs/1", name: CARRIER_SERVICE_NAME, callbackUrl: CALLBACK, active: false },
      { id: "gid://cs/1", callbackUrl: CALLBACK, active: false },
    ]);
  });

  it("leaves a service already named, pointed and off alone", async () => {
    const { admin, calls } = adminWith([{ id: "gid://cs/2", name: CARRIER_SERVICE_NAME, active: false, callbackUrl: CALLBACK }]);
    await ensureCarrierServiceRegistered(admin, APP);
    expect(updates(calls)).toEqual([]);
  });

  it("registers a new shop's service under the new name, inactive", async () => {
    const { admin, calls } = adminWith([{ id: "gid://ups", name: "UPS", active: true, callbackUrl: "https://ups.example" }]);
    await ensureCarrierServiceRegistered(admin, APP);
    const create = calls.find((c) => /carrierServiceCreate\(/.test(c.query));
    expect(create?.input).toMatchObject({ name: CARRIER_SERVICE_NAME, callbackUrl: CALLBACK, active: false });
    expect(updates(calls)).toEqual([]);
  });
});

describe("setCarrierServiceActive", () => {
  it("finds the shop's service under its old name too", async () => {
    const { admin, calls } = adminWith([{ id: "gid://cs/3", name: "ink. Verified Delivery", active: true, callbackUrl: CALLBACK }]);
    expect(await setCarrierServiceActive(admin, false)).toBe(true);
    expect(updates(calls)).toEqual([{ id: "gid://cs/3", active: false }]);
  });
});
