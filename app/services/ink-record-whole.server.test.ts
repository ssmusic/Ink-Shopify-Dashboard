// THE MERCHANT SEES THE WHOLE RECORD — ink's order accordion (Sam, 2026-09-23:
// "merchants need to see lots of compelling data — the 29 gets it signed";
// ink-backend #129).
//
// What these pin:
//   1. With the shop's OWN key the accordion reads the merchant door
//      (GET {api}/proofs/:id/audit): the whole record — every signed event,
//      each checked against ink's published key, read separately from its own
//      door, once per screen — and the hand-over for sale at its price. Only
//      words reach the screen: no signed bytes, no hash, no coordinate.
//   2. A tampered event is said as not verifying, and the record as not
//      checking out. A key that did not load is "not checked", never "failed".
//   3. No key (a fresh install) or a refused merchant door → the public words,
//      exactly as before.
//   4. The hand-over: the public lock and the merchant's for-sale view lock
//      it; bought and free do not.

import { createHash, generateKeyPairSync, sign } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { readRecords } from "./ink-record.server";
import { HANDOVER_SENTENCE, handoverLocked, handoverPrice } from "../lib/record-handover";

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
const jwk = publicKey.export({ format: "jwk" }) as { kty: string; crv: string; x: string };
const JWKS = { keys: [{ ...jwk, kid: "key_001", alg: "EdDSA", use: "sig" }] };
const PROOF = "proof_" + "a".repeat(24);
const OTHER = "proof_" + "b".repeat(24);
const API = "https://us-central1-inink-c76d3.cloudfunctions.net/api";
const KEY = "ink_live_shop_a";

type Ev = { event_id: string; seq: number; event_type: string; timestamp: string; key_id: string; signature_alg: string; signature: string; payload_hash: string; prev_event_id: string | null; prev_payload_hash: string | null; signed_bytes: string; withheld: boolean; withheld_reason: null; legacy: boolean };
function signed(seq: number, prev: Ev | null, type: string, at: string, gps: { lat: number; lng: number } | null = null): Ev {
  const payload = { event_id: `evt_${seq}`, proof_id: PROOF, shop_id: "shop_a", event_type: type, event_data: { n: seq }, gps, timestamp: at, seq, prev_event_id: prev?.event_id ?? null, prev_payload_hash: prev?.payload_hash ?? null };
  const bytes = JSON.stringify(payload);
  return {
    event_id: `evt_${seq}`, seq, event_type: type, timestamp: at, key_id: "key_001", signature_alg: "ed25519",
    signature: sign(null, Buffer.from(bytes), privateKey).toString("hex"),
    payload_hash: createHash("sha256").update(bytes).digest("hex"),
    prev_event_id: payload.prev_event_id, prev_payload_hash: payload.prev_payload_hash, signed_bytes: bytes,
    withheld: false, withheld_reason: null, legacy: false,
  };
}
const e1 = signed(1, null, "ENROLLED", "2026-09-10T12:00:00.000Z", { lat: 34.0921, lng: -118.2681 });
const e2 = signed(2, e1, "CARRIER_DELIVERED", "2026-09-12T12:00:00.000Z");
const e3 = signed(3, e2, "TAP_RECORDED", "2026-09-13T12:00:00.000Z", { lat: 34.0923, lng: -118.2681 });

const SUMMARY = { order_number: "#1042", buyer_initials: "MC", opens: 1, first_open_at: "2026-09-13T12:00:00.000Z" };
const ELEMENTS = [
  { element: "order", required: true, label: "Order", value: { order_number: "#1042" }, status: "attested" },
  { element: "the_open", required: true, label: "The open", value: { opens: 1, location: { verdict: "pass", distance_m: 22 } }, status: "verified" },
];
const FOR_SALE = { locked: false, purchased: false, price_cents: 2900, currency: "USD" };
const whole = (chain: Ev[], record: unknown = FOR_SALE) => ({
  proof_id: PROOF, audience: "merchant", issued_at: "2026-09-23T12:00:00.000Z",
  issuer: { name: "ink", alg: "ed25519", key_ids: ["key_001"], jwks_url: `${API}/.well-known/jwks.json` },
  summary: SUMMARY,
  verdict: { elements: ELEMENTS.map((e) => ({ ...e, evidence_event_ids: ["evt_3"] })), elements_complete: true, chain_integrity: { chained_events: chain.length, chain_valid: true, legacy_events: 0, legacy_verified: 0 } },
  chain, legacy_events: [], withheld: { count: 0, reason: null },
  chain_head: { seq: chain.length, event_id: chain[chain.length - 1]?.event_id ?? null, payload_hash: chain[chain.length - 1]?.payload_hash ?? null },
  ...(record ? { record } : {}),
});
const WORDS = { proof_id: PROOF, audience: "public", summary: SUMMARY, verdict: { elements: ELEMENTS, elements_complete: true }, record: { locked: true, price_cents: 2900, currency: "USD" } };

type Call = { url: string; auth: string | null };
function doors(routes: Record<string, () => Response>) {
  const calls: Call[] = [];
  const f = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, auth: new Headers(init?.headers).get("Authorization") });
    for (const [needle, answer] of Object.entries(routes)) if (url.includes(needle)) return answer();
    return new Response("{}", { status: 404 });
  }) as unknown as typeof fetch;
  return { f, calls };
}
const json = (b: unknown, status = 200) => () => new Response(JSON.stringify(b), { status });

describe("ink's accordion reads the merchant's WHOLE record with the shop's own key", () => {
  it("the merchant door: every signed event checked against the published key, and the hand-over for sale", async () => {
    const { f, calls } = doors({
      [`/proofs/${PROOF}/audit`]: json(whole([e1, e2, e3])),
      [`/proofs/${OTHER}/audit`]: json(whole([e1, e2, e3])),
      "/.well-known/jwks.json": json(JWKS),
      "/verify/": json(WORDS),
    });
    const out = await readRecords([PROOF, OTHER], f, KEY);
    const r = out[PROOF];
    expect(r.whole).toBe(true);
    expect(r.locked).toBe(false);
    expect(r.forSale).toEqual({ price_cents: 2900, currency: "USD" });
    expect(r.elements.map((e) => e.element)).toEqual(["order", "the_open"]);
    expect(r.events).toEqual([
      { seq: 1, event_id: "evt_1", type: "Order recorded", at: "2026-09-10T12:00:00.000Z", check: "verified", legacy: false },
      { seq: 2, event_id: "evt_2", type: "Carrier delivered", at: "2026-09-12T12:00:00.000Z", check: "verified", legacy: false },
      { seq: 3, event_id: "evt_3", type: "Opened", at: "2026-09-13T12:00:00.000Z", check: "verified", legacy: false },
    ]);
    expect(r.checks).toEqual({
      sound: true,
      headline: "Checked against the published key: 3 of 3 signatures verified · every link intact.",
      lines: ["Signatures: 3 of 3 verified against key_001", "Hash links: 3 of 3 intact · sequence complete · matches the ledger's head"],
    });
    // Read with the shop's own key, from the merchant door; the key read once
    // for the whole screen, from its own door; the public door never asked.
    const audits = calls.filter((c) => c.url.includes("/audit"));
    expect(audits.map((c) => c.url)).toEqual([`${API}/proofs/${PROOF}/audit`, `${API}/proofs/${OTHER}/audit`]);
    expect(audits.every((c) => c.auth === `Bearer ${KEY}`)).toBe(true);
    expect(calls.filter((c) => c.url.endsWith("/.well-known/jwks.json"))).toHaveLength(1);
    expect(calls.some((c) => c.url.includes("/verify/"))).toBe(false);
    // Only words reach the screen.
    expect(JSON.stringify(out)).not.toMatch(/signed_bytes|payload_hash|signature_alg|"lat"|"lng"|34\.09|-118\.26/);
  });

  it("a tampered event does not verify, and the record does not check out; a key that did not load is 'not checked'", async () => {
    const bad = { ...e2, signature: e2.signature.replace(/^./, (c) => (c === "a" ? "b" : "a")) };
    const tampered = doors({ "/audit": json(whole([e1, bad, e3])), "/.well-known/jwks.json": json(JWKS) });
    const t = (await readRecords([PROOF], tampered.f, KEY))[PROOF];
    expect(t.events?.map((e) => e.check)).toEqual(["verified", "does not verify", "verified"]);
    expect(t.checks?.sound).toBe(false);
    expect(t.checks?.headline).toBe("This record does not check out.");

    const keyless = doors({ "/audit": json(whole([e1, e2, e3])), "/.well-known/jwks.json": json({ error: "down" }, 500) });
    const k = (await readRecords([PROOF], keyless.f, KEY))[PROOF];
    expect(k.whole).toBe(true);
    expect(k.events?.map((e) => e.check)).toEqual(["not checked", "not checked", "not checked"]);
    expect(k.checks).toEqual({ sound: false, headline: "Not checked: the published key did not load.", lines: [] });
  });

  it("bought: the whole record and nothing for sale; free (no record block): the whole record and nothing for sale", async () => {
    const bought = doors({ "/audit": json(whole([e1, e2, e3], { locked: false, purchased: true, outcome: "open", packet_url: "https://www.in.ink/verify/x?key=k" })), "/.well-known/jwks.json": json(JWKS) });
    const b = (await readRecords([PROOF], bought.f, KEY))[PROOF];
    expect(b.whole).toBe(true);
    expect(b.forSale).toBeNull();
    const free = doors({ "/audit": json(whole([e1, e2, e3], null)), "/.well-known/jwks.json": json(JWKS) });
    const fr = (await readRecords([PROOF], free.f, KEY))[PROOF];
    expect(fr.whole).toBe(true);
    expect(fr.forSale).toBeNull();
    expect(fr.checks?.sound).toBe(true);
  });

  it("no key (a fresh install), or the merchant door refused → the public words, exactly as before", async () => {
    const noKey = doors({ "/audit": json(whole([e1, e2, e3])), "/.well-known/jwks.json": json(JWKS), "/verify/": json(WORDS) });
    const n = (await readRecords([PROOF], noKey.f, null))[PROOF];
    expect(n.whole).toBeFalsy();
    expect(n.locked).toBe(true);
    expect(n.events).toBeUndefined();
    expect(noKey.calls.some((c) => c.url.includes("/audit") || c.url.includes("jwks"))).toBe(false);

    for (const refusal of [json({ error: "Proof not found" }, 404), json({ error: "Invalid API key" }, 401), () => { throw new Error("timeout"); }]) {
      const refused = doors({ "/audit": refusal as () => Response, "/.well-known/jwks.json": json(JWKS), "/verify/": json(WORDS) });
      const r = (await readRecords([PROOF], refused.f, KEY))[PROOF];
      expect(r.whole).toBeFalsy();
      expect(r.locked).toBe(true);
      expect(r.elements.map((e) => e.element)).toEqual(["order", "the_open"]);
      expect(refused.calls.some((c) => c.url === `${API}/verify/${PROOF}`)).toBe(true);
    }
  });
});

describe("the hand-over", () => {
  it("is locked by the public words and by the merchant's for-sale view; bought and free are not", () => {
    expect(handoverLocked({ locked: true, price_cents: 2900, currency: "USD" })).toBe(true);
    expect(handoverLocked(FOR_SALE)).toBe(true);
    expect(handoverLocked({ locked: false, purchased: true, packet_url: "x" })).toBe(false);
    expect(handoverLocked(undefined)).toBe(false);
    expect(handoverLocked(null)).toBe(false);
    expect(handoverLocked({ locked: false })).toBe(false);
    expect(handoverPrice(FOR_SALE)).toEqual({ price_cents: 2900, currency: "USD" });
    expect(handoverPrice({ locked: false, purchased: true })).toBeNull();
    // PLACEHOLDER — the sentence says what the $29 buys.
    expect(HANDOVER_SENTENCE).toBe("The signed copy to hand over.");
  });
});
