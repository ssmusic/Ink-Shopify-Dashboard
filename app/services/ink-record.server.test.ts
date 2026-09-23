// EACH ORDER'S RECORD, READ FOR THE SCREEN — and said in the record page's words.

import { describe, expect, it, vi } from "vitest";
import { readRecord, readRecords, recordFromBody } from "./ink-record.server";
import { elementLines, locationWordOf, opensOf, recordDownloadsAvailable } from "../lib/record-words";

const PROOF = "proof_aec827b527fb30457c1da890";
// Merchant-audit fixture adapted from the earlier record response.
const BODY = {
  proof_id: PROOF,
  audience: "merchant",
  summary: { order_number: "#1010", buyer_initials: "SM", opens: 1 },
  verdict: {
    elements: [
      { element: "order", required: true, label: "Order", value: { order_number: "#1010", enrolled_at: "2026-08-20T18:50:54.195Z" }, status: "attested" },
      { element: "delivery_date", required: true, label: "Delivery date", value: null, status: "missing" },
      { element: "the_open", required: true, label: "The open", value: { opens: 1, first_open_signed: true, location: { verdict: "flagged", distance_m: 719, accuracy_m: 35, signed: false, later_share: { verdict: "pass", distance_m: 40 } } }, status: "verified" },
    ],
    elements_complete: false,
  },
  record: { locked: true, price_cents: 2900, currency: "USD" },
};
const ok = (body: unknown) => vi.fn(async () => new Response(JSON.stringify(body), { status: 200 })) as unknown as typeof fetch;

describe("readRecord", () => {
  it("keeps the hand-over's purchase distinct from the merchant's whole view", () => {
    const chain = [{ event_id: "event_12345678", event_type: "TAP_RECORDED", timestamp: "2026-09-20T00:00:00Z", seq: 1 }];
    const forSale = recordFromBody({ ...BODY, audience: "merchant", chain, legacy_events: [], record: { locked: false, purchased: false, price_cents: 2900, currency: "USD" } });
    expect(forSale).toMatchObject({ locked: false, whole: true, forSale: { price_cents: 2900, currency: "USD" } });
    expect(recordDownloadsAvailable(forSale)).toBe(false);
    const bought = recordFromBody({ ...BODY, audience: "merchant", chain, legacy_events: [], record: { locked: false, purchased: true, price_cents: 2900, currency: "USD" } });
    expect(bought?.forSale).toBeNull();
    expect(recordDownloadsAvailable(bought)).toBe(true);
    // The public words of a priced record hand nothing over.
    expect(recordDownloadsAvailable(recordFromBody(BODY))).toBe(false);
  });
  it("takes a whole record only from this proof's merchant audit", async () => {
    const whole = { ...BODY, audience: "merchant", chain: [], legacy_events: [], record: { locked: false, purchased: true } };
    const door = (audit: unknown, words: unknown = BODY) =>
      vi.fn(async (url: string) =>
        new Response(JSON.stringify(url.includes("/audit") ? audit : url.endsWith("/jwks.json") ? { keys: [] } : words)),
      ) as unknown as typeof fetch;
    expect((await readRecord(PROOF, door(whole), "merchant-test"))?.whole).toBe(true);
    // Another proof's audit, or a public answer at the merchant door, is never this order's whole record.
    for (const patch of [{ proof_id: "proof_bbbbbbbbbbbbbbbbbbbbbbbb" }, { audience: "public" }]) {
      const r = await readRecord(PROOF, door({ ...whole, ...patch }), "merchant-test");
      expect(r?.whole).not.toBe(true);
    }
    // Nor are another proof's public words.
    expect(await readRecord(PROOF, door(null, { ...BODY, proof_id: "proof_bbbbbbbbbbbbbbbbbbbbbbbb" }))).toBeNull();
  });
  it("reads the public words projection — no key, no secret — and keeps the words of a locked record", async () => {
    const f = ok(BODY);
    const r = await readRecord(PROOF, f);
    expect((f as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0]).toBe(`https://us-central1-inink-c76d3.cloudfunctions.net/api/verify/${PROOF}`);
    expect(r?.locked).toBe(true);
    expect(r?.elements.map((e) => e.element)).toEqual(["order", "delivery_date", "the_open"]);
    expect(opensOf(r)).toBe(1);
  });

  it("is nothing for a value that is not a proof id, a refusal, or a slow read — never an error page", async () => {
    const f = ok(BODY);
    expect(await readRecord("nfc_abc", f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(await readRecord(PROOF, vi.fn(async () => new Response("{}", { status: 404 })) as unknown as typeof fetch)).toBeNull();
    expect(await readRecord(PROOF, vi.fn(async () => { throw new Error("timeout"); }) as unknown as typeof fetch)).toBeNull();
    expect(recordFromBody({ nope: true })).toBeNull();
  });

  it("reads each listed order once, side by side, and drops the ones that failed", async () => {
    const f = vi.fn(async (url: string) => (url.endsWith(PROOF) ? new Response(JSON.stringify(BODY)) : new Response("{}", { status: 500 }))) as unknown as typeof fetch;
    const out = await readRecords([PROOF, PROOF, null, "proof_000000000000000000000000"], f);
    expect(Object.keys(out)).toEqual([PROOF]);
    expect((f as unknown as { mock: { calls: unknown[] } }).mock.calls).toHaveLength(2);
  });
});

describe("the record in words", () => {
  const record = recordFromBody(BODY)!;

  it("says each value the way the public record page does — never a coordinate", () => {
    const open = record.elements.find((e) => e.element === "the_open")!;
    expect(elementLines(open)).toEqual([
      { label: "Opens", words: "1" },
      { label: "First open signed", words: "Yes" },
      { label: "Location", words: "719 m from the delivery address" },
      { label: "Later share", words: "40 m from the delivery address" },
    ]);
    expect(JSON.stringify(elementLines(open))).not.toMatch(/accuracy|lat|lng/);
  });

  it("says an open's location as a distance in Codex's words, never a judgment of it (Sam: \"we dont judge\")", () => {
    // Codex's words (4022900), as Sam chose them on 2026-09-23.
    expect(locationWordOf(record)).toBe("719 m from the delivery address");
    const say = (verdict: string, distance_m: number | null = null) =>
      locationWordOf({ ...record, elements: [{ element: "the_open", label: "The open", status: "verified", value: { location: { verdict, distance_m } } }] });
    expect(say("pass", 56)).toBe("56 m from the delivery address");
    expect(say("pass")).toBe("Distance unavailable");
    expect(say("not_shared")).toBe("Location not shared");
    expect(say("unmeasured")).toBe("Distance unavailable");
    expect(say("imprecise")).toBe("Location accuracy too low to measure");
    for (const v of ["pass", "near", "flagged"]) expect(say(v, 250)).not.toMatch(/within|outside|near|pass|flag/i);
    expect(locationWordOf(null)).toBe("");
  });

  it("never prints the backend's verdict word beside a distance", () => {
    const open = record.elements.find((e) => e.element === "the_open")!;
    expect(JSON.stringify(elementLines(open))).not.toMatch(/\((pass|near|flagged)\)/);
  });
  // PARKED, 2026-09-23: Codex's record, as Sam chose it, prints the delivery
  // place's "Seen at the door" (the backend's 100 m yes/no). Sam's answer on the
  // range words (the orchestrator's open question) decides whether it stays.
  it.todo("never prints the at-the-door yes/no — it judges against the 100 m range");
});

describe("recordFromBody — the browsers (2026-09-23)", () => {
  const ID = "0f1e2d3c4b5a69788796a5b4c3d2e1f0";
  const LIST = [{ label: "A", browser_id: ID, device: "iPhone", opens: 2, first_open_at: "2026-09-13T00:00:00.000Z", last_open_at: "2026-09-14T00:00:00.000Z", first_seen_after_delivered_scan: true, anything_else: "x" }];

  it("keeps the browsers in words — never a browser's id, even when a free record's read serves one", () => {
    const r = recordFromBody({ ...BODY, browsers: { count: 1, unknown_opens: 3, list: LIST } });
    expect(r?.browsers).toEqual({
      count: 1,
      unknown_opens: 3,
      list: [{ label: "A", device: "iPhone", opens: 2, first_open_at: "2026-09-13T00:00:00.000Z", last_open_at: "2026-09-14T00:00:00.000Z", first_seen_after_delivered_scan: true }],
    });
    expect(JSON.stringify(r)).not.toContain(ID);
  });

  it("an older read with no browsers reads exactly as it did — no key at all", () => {
    expect("browsers" in (recordFromBody(BODY) ?? {})).toBe(false);
    expect("browsers" in (recordFromBody({ ...BODY, browsers: "nope" }) ?? {})).toBe(false);
  });
});

describe("recordFromBody — only known fields leave the server (the ink review, 2026-09-23)", () => {
  it("projects each element's values and the location to what the words print — no fix, no unknown field", () => {
    const body = {
      ...BODY,
      verdict: {
        elements: [
          {
            element: "the_open",
            label: "The open",
            status: "verified",
            value: {
              opens: 1,
              device_fingerprint: "fp_secret",
              gps: { lat: 34.11, lng: -118.23 },
              location: { verdict: "flagged", distance_m: 719, accuracy_m: 35, lat: 34.11, lng: -118.23, later_share: { verdict: "pass", distance_m: 40, lat: 1, later_share: { distance_m: 2 } } },
            },
          },
        ],
      },
    };
    const open = recordFromBody(body)!.elements[0];
    expect(open.value).toEqual({
      opens: 1,
      location: { verdict: "flagged", distance_m: 719, accuracy_m: 35, later_share: { verdict: "pass", distance_m: 40 } },
    });
    expect(JSON.stringify(recordFromBody(body))).not.toMatch(/fp_secret|"lat"|"lng"|"gps"/);
  });

  it("keeps the summary to the screen's fields — never the buyer's initials", () => {
    expect(recordFromBody(BODY)?.summary).toEqual({ order_number: "#1010", opens: 1 });
  });

  it("says each signed event in words — never its signed bytes, signature, hash or revealed fix", () => {
    const whole = recordFromBody({
      ...BODY,
      record: { locked: false, purchased: true },
      chain: [
        { event_id: "event_12345678", event_type: "TAP_RECORDED", timestamp: "2026-09-20T00:00:00Z", seq: 1, signature: "sig_secret", payload_hash: "hash_secret", signed_bytes: "private address", revealed: { gps: { lat: 34 } } },
      ],
      legacy_events: [],
    });
    expect(whole?.events).toEqual([{ seq: 1, event_id: "event_12345678", type: "Opened", at: "2026-09-20T00:00:00Z", check: "not checked", legacy: false }]);
    expect(JSON.stringify(whole)).not.toMatch(/private address|sig_secret|hash_secret|"lat"|"gps"/);
  });

  it("reads the merchant door over HTTPS with the shop's own key, refusing a redirect", async () => {
    const f = vi.fn(async (url: string) => new Response(JSON.stringify(url.endsWith("/jwks.json") ? { keys: [] } : BODY))) as unknown as typeof fetch;
    await readRecord(PROOF, f, "merchant-test");
    const calls = (f as unknown as { mock: { calls: [string, RequestInit][] } }).mock.calls;
    const audit = calls.find(([url]) => url.endsWith(`/proofs/${PROOF}/audit`));
    expect(audit?.[0]).toBe(`https://us-central1-inink-c76d3.cloudfunctions.net/api/proofs/${PROOF}/audit`);
    expect(new Headers(audit?.[1].headers).get("Authorization")).toBe("Bearer merchant-test");
    expect(audit?.[1].redirect).toBe("error");
  });
});
