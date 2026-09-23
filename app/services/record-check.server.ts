// THE CHECKS, FOR INK'S ACCORDION — every signed event of an order's record
// re-checked against the published key, read from its own door (never the key
// a packet names beside its signatures: a key delivered beside a signature
// certifies nothing). The same checks the record page runs in a stranger's
// browser (the-ritualist src/lib/verify-record.ts), here with Node's crypto:
//   · sha256(signed_bytes) === payload_hash             the bytes are the record
//   · ed25519.verify(signed_bytes, signature, key[kid])  ink signed those bytes
//   · prev_payload_hash === previous.payload_hash        the chain is unbroken
//   · seq is 1, 2, 3 … with no gap                        nothing was removed
//   · the ledger's head is the last event served          no tail was cut
// Pure arithmetic over the two documents; no fetch.

import { createHash, createPublicKey, verify, type KeyObject } from "node:crypto";

export type PacketEvent = {
  event_id?: string | null;
  seq?: number | null;
  event_type?: string | null;
  timestamp?: string | null;
  key_id?: string;
  signature?: string | null;
  payload_hash?: string | null;
  prev_event_id?: string | null;
  prev_payload_hash?: string | null;
  signed_bytes?: string | null;
  withheld?: boolean;
  legacy?: boolean;
  unverifiable?: boolean;
};

export type WholePacket = {
  chain?: PacketEvent[];
  legacy_events?: PacketEvent[];
  chain_head?: { seq?: number; payload_hash?: string | null } | null;
};

export type Jwks = { keys?: Array<{ kty?: string; crv?: string; kid?: string; x?: string }> };

export type SignatureCheck = "verified" | "failed" | "withheld" | "no-key" | "unverifiable";

export type EventCheck = {
  event_id: string | null;
  seq: number | null;
  event_type: string | null;
  timestamp: string | null;
  signature: SignatureCheck;
  hash: "verified" | "failed" | "withheld" | "unverifiable";
  link: "verified" | "failed" | "first" | "n/a";
  legacy: boolean;
};

export type RecordCheck = {
  events: EventCheck[];
  signatures: { verified: number; failed: number; withheld: number; no_key: number; checkable: number };
  links: { verified: number; failed: number };
  sequence_dense: boolean;
  legacy: { verified: number; failed: number; withheld: number; unverifiable: number };
  keys_used: string[];
  head: "matches" | "cut" | "ahead" | "unknown";
  sound: boolean;
};

/** The Ed25519 keys a JWKS document publishes, by kid. */
export function keysFromJwks(jwks: Jwks | null | undefined): Map<string, KeyObject> {
  const out = new Map<string, KeyObject>();
  for (const k of jwks?.keys ?? []) {
    if (!k || k.kty !== "OKP" || k.crv !== "Ed25519" || typeof k.x !== "string" || typeof k.kid !== "string") continue;
    try {
      out.set(k.kid, createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: k.x }, format: "jwk" }));
    } catch {
      /* a malformed key is not a key */
    }
  }
  return out;
}

const sha256Hex = (text: string) => createHash("sha256").update(text, "utf8").digest("hex");

function checkOne(e: PacketEvent, keys: Map<string, KeyObject>): Pick<EventCheck, "signature" | "hash"> {
  if (e.unverifiable === true || (e.legacy && !e.withheld && typeof e.signed_bytes !== "string")) return { signature: "unverifiable", hash: "unverifiable" };
  if (e.withheld || typeof e.signed_bytes !== "string") return { signature: "withheld", hash: "withheld" };
  const hashOk = typeof e.payload_hash === "string" && sha256Hex(e.signed_bytes) === e.payload_hash;
  const key = typeof e.key_id === "string" ? keys.get(e.key_id) : undefined;
  if (!key) return { signature: "no-key", hash: hashOk ? "verified" : "failed" };
  let sigOk = false;
  try {
    sigOk = typeof e.signature === "string" && /^[0-9a-fA-F]+$/.test(e.signature)
      && verify(null, Buffer.from(e.signed_bytes, "utf8"), key, Buffer.from(e.signature, "hex"));
  } catch {
    sigOk = false;
  }
  return { signature: sigOk ? "verified" : "failed", hash: hashOk ? "verified" : "failed" };
}

/** Every check a stranger can run, over the packet and the separately read keys. */
export function checkRecord(packet: WholePacket, jwks: Jwks | null | undefined): RecordCheck {
  const keys = keysFromJwks(jwks);
  const chain = [...(packet?.chain ?? [])].sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
  const events: EventCheck[] = [];
  const signatures = { verified: 0, failed: 0, withheld: 0, no_key: 0, checkable: 0 };
  const links = { verified: 0, failed: 0 };
  let dense = true;
  const keysUsed = new Set<string>();

  chain.forEach((e, i) => {
    const prior = i ? chain[i - 1] : null;
    const { signature, hash } = checkOne(e, keys);
    const link: EventCheck["link"] = prior
      ? (e.prev_payload_hash === prior.payload_hash && e.prev_event_id === prior.event_id ? "verified" : "failed")
      : (!e.prev_payload_hash && !e.prev_event_id ? "first" : "failed");
    const seqOk = prior ? e.seq === (prior.seq ?? 0) + 1 : e.seq === 1;
    if (!seqOk) dense = false;
    if (link === "failed") links.failed += 1; else links.verified += 1;
    if (signature === "withheld") signatures.withheld += 1;
    else {
      signatures.checkable += 1;
      if (signature === "verified") signatures.verified += 1;
      else if (signature === "failed") signatures.failed += 1;
      else signatures.no_key += 1;
    }
    if (typeof e.key_id === "string" && keys.has(e.key_id)) keysUsed.add(e.key_id);
    events.push({ event_id: e.event_id ?? null, seq: e.seq ?? null, event_type: e.event_type ?? null, timestamp: e.timestamp ?? null, signature, hash, link, legacy: false });
  });

  const legacy = { verified: 0, failed: 0, withheld: 0, unverifiable: 0 };
  for (const e of packet?.legacy_events ?? []) {
    const { signature, hash } = checkOne(e, keys);
    if (signature === "unverifiable") legacy.unverifiable += 1;
    else if (signature === "withheld") legacy.withheld += 1;
    else if (signature === "verified" && hash === "verified") legacy.verified += 1;
    else legacy.failed += 1;
    if (typeof e.key_id === "string" && keys.has(e.key_id)) keysUsed.add(e.key_id);
    events.push({ event_id: e.event_id ?? null, seq: null, event_type: e.event_type ?? null, timestamp: e.timestamp ?? null, signature, hash, link: "n/a", legacy: true });
  }

  const anyHashFailed = events.some((c) => c.hash === "failed");
  const last = chain.length ? chain[chain.length - 1] : null;
  const head = packet?.chain_head;
  let headState: RecordCheck["head"] = "unknown";
  if (head && Number.isInteger(head.seq) && last) {
    if (last.seq === head.seq && (head.payload_hash == null || last.payload_hash === head.payload_hash)) headState = "matches";
    else if ((last.seq ?? 0) < (head.seq as number)) headState = "cut";
    else headState = "ahead";
  } else if (head && Number.isInteger(head.seq) && !last && (head.seq as number) > 0) {
    headState = "cut";
  }
  const sound = signatures.failed === 0 && signatures.no_key === 0 && !anyHashFailed && links.failed === 0 && dense && legacy.failed === 0
    && headState !== "cut"
    && (chain.length > 0 || (packet?.legacy_events?.length ?? 0) > 0);
  return { events, signatures, links, sequence_dense: dense, legacy, keys_used: [...keysUsed], head: headState, sound };
}
