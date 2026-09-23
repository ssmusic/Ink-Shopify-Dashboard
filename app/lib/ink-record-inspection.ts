/** Merchant-gated audit fields used by the on-demand Advanced inspector. */
export type InspectEvent = {
  id: string;
  type: string;
  at: string | null;
  sequence: number | null;
  legacy: boolean;
  keyId: string | null;
  payloadHash: string | null;
  previousEventId: string | null;
  previousHash: string | null;
  signature: string | null;
  signedBytes: string | null;
  unverifiable: boolean;
  location: { lat: number; lng: number } | null;
};

export type InspectOpen = {
  at: string | null;
  distanceM: number | null;
  accuracyM: number | null;
  location: { lat: number; lng: number } | null;
  verdict?: string | null;
};

export type InkInspection = {
  proofId: string;
  chainHead: {
    sequence: number;
    eventId: string | null;
    payloadHash: string | null;
  } | null;
  events: InspectEvent[];
  evidenceIds?: Record<string, string[]>;
  opens: InspectOpen[] | null;
  opensCapped: boolean;
  address?: { lat: number; lng: number } | null;
  addressLabel?: string | null;
};

const obj = (value: unknown): Record<string, unknown> | null =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
const str = (value: unknown): string | null =>
  typeof value === "string" && value.length ? value : null;
const positive = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
const measuredDistance = (data: Record<string, unknown>): number | null => {
  const distance = positive(data.distance_m);
  return ["pass", "near", "flagged"].includes(
    String(data.gps_verdict ?? "").toLowerCase(),
  ) &&
    distance != null &&
    distance > 0
    ? distance
    : null;
};
const point = (value: unknown): { lat: number; lng: number } | null => {
  const p = obj(value);
  const lat = p?.lat ?? p?.latitude;
  const lng = p?.lng ?? p?.longitude;
  return typeof lat === "number" &&
    typeof lng === "number" &&
    Number.isFinite(lat) &&
    Number.isFinite(lng) &&
    lat >= -90 &&
    lat <= 90 &&
    lng >= -180 &&
    lng <= 180 &&
    !(lat === 0 && lng === 0)
    ? { lat, lng }
    : null;
};
const event = (raw: unknown): InspectEvent | null => {
  const e = obj(raw);
  if (!e || !str(e.event_id)) return null;
  const revealed = obj(e.revealed);
  return {
    id: str(e.event_id)!,
    type: str(e.event_type) ?? "Event",
    at: str(e.timestamp),
    sequence: Number.isSafeInteger(e.seq) ? Number(e.seq) : null,
    legacy: e.legacy === true,
    keyId: str(e.key_id),
    payloadHash: str(e.payload_hash),
    previousEventId: str(e.prev_event_id),
    previousHash: str(e.prev_payload_hash),
    signature: str(e.signature),
    signedBytes: str(e.signed_bytes),
    unverifiable: e.unverifiable === true,
    location:
      point(revealed?.gps) ??
      point(revealed?.customer_gps) ??
      point(revealed?.initiation_gps),
  };
};

const signedData = (raw: unknown): Record<string, unknown> | null => {
  const e = obj(raw);
  if (!str(e?.signed_bytes)) return null;
  try {
    return obj(JSON.parse(String(e!.signed_bytes)));
  } catch {
    return null;
  }
};

/** The paid merchant audit can supply a complete open list before the dedicated door ships.
 * Classify human opens from their signed tap_outcome, as auditPacket does. */
function opensFromAudit(
  audit: Record<string, unknown>,
  rawEvents: unknown[],
): InspectOpen[] | null {
  const taps = rawEvents.filter(
    (raw) => obj(raw)?.event_type === "TAP_RECORDED",
  );
  const locations = rawEvents.filter(
    (raw) => obj(raw)?.event_type === "LOCATION_SHARED",
  );
  const shares = new Map<
    string,
    { data: Record<string, unknown>; raw: Record<string, unknown> }
  >();
  for (const raw of locations) {
    const e = obj(raw),
      data = obj(signedData(raw)?.event_data),
      id = str(data?.tap_id);
    if (e && data && id && !shares.has(id)) shares.set(id, { data, raw: e });
  }
  const opens: InspectOpen[] = [];
  for (const raw of taps) {
    const e = obj(raw),
      data = obj(signedData(raw)?.event_data);
    if (!e || !data) return null;
    if (
      ["proxy", "stale"].includes(String(data.tap_outcome ?? "").toLowerCase())
    )
      continue;
    const share = str(data.tap_id) ? shares.get(String(data.tap_id)) : null;
    const ownLocation =
      point(obj(e.revealed)?.gps) ?? point(signedData(raw)?.gps);
    const laterLocation = share
      ? (point(obj(share.raw.revealed)?.gps) ??
        point(signedData(share.raw)?.gps))
      : null;
    const ownDistance = measuredDistance(data);
    const laterDistance = share ? measuredDistance(share.data) : null;
    opens.push({
      at: str(e.timestamp),
      distanceM: ownDistance ?? laterDistance,
      accuracyM:
        ownDistance == null && laterDistance != null
          ? positive(share?.data.accuracy_m)
          : positive(data.accuracy_m),
      location: ownLocation ?? laterLocation,
      verdict:
        ownDistance == null && laterDistance != null
          ? str(share?.data.gps_verdict)
          : str(data.gps_verdict),
    });
  }
  const reported = obj(audit.summary)?.opens;
  // A partial event set must never be titled "Every open".
  if (typeof reported !== "number" || reported !== opens.length) return null;
  return opens.sort((a, b) => Date.parse(a.at ?? "") - Date.parse(b.at ?? ""));
}

/** No raw token, fingerprint, customer contact or arbitrary revealed field crosses to JSX. */
export function inspectionFromAudit(
  audit: unknown,
  opensBody: unknown,
): InkInspection | null {
  const a = obj(audit);
  if (!a || !str(a.proof_id)) return null;
  const head = obj(a.chain_head);
  const suppliedOpens = obj(opensBody);
  const o = suppliedOpens?.proof_id && suppliedOpens.proof_id !== a.proof_id
    ? null : suppliedOpens;
  const rawEvents = [
    ...(Array.isArray(a.chain) ? a.chain : []),
    ...(Array.isArray(a.legacy_events) ? a.legacy_events : []),
  ];
  const opens = Array.isArray(o?.opens)
    ? o.opens.flatMap((raw): InspectOpen[] => {
        const row = obj(raw);
        if (
          !row ||
          ["proxy", "stale"].includes(String(row.outcome ?? "").toLowerCase())
        )
          return [];
        return [
          {
            at: str(row.at),
            distanceM: positive(row.distance_m),
            accuracyM: positive(row.accuracy_m),
            location: point(row),
            verdict: str(row.gps_verdict),
          },
        ];
      })
    : opensFromAudit(a, rawEvents);
  const verdict = obj(a.verdict);
  const evidenceIds = Object.fromEntries(
    (Array.isArray(verdict?.elements) ? verdict.elements : []).flatMap(
      (raw) => {
        const row = obj(raw);
        if (
          !row ||
          ![
            "order",
            "buyer",
            "delivery_date",
            "delivery_place",
            "carrier_scan",
            "the_open",
          ].includes(String(row.element))
        )
          return [];
        const ids = Array.isArray(row.evidence_event_ids)
          ? row.evidence_event_ids.filter(
              (id): id is string =>
                typeof id === "string" && /^event_[a-zA-Z0-9_-]+$/.test(id),
            )
          : [];
        return [[String(row.element), [...new Set(ids)]]];
      },
    ),
  );
  return {
    proofId: str(a.proof_id)!,
    address: point(o?.address),
    addressLabel: (() => {
      const ship = obj(obj(a.summary)?.ship_to);
      if (!ship) return null;
      return ["line1", "line2", "city", "region", "postal_code", "country"]
        .map((key) => str(ship[key]))
        .filter(Boolean).join(", ") || null;
    })(),
    evidenceIds,
    chainHead:
      head && Number.isSafeInteger(head.seq)
        ? {
            sequence: Number(head.seq),
            eventId: str(head.event_id),
            payloadHash: str(head.payload_hash),
          }
        : null,
    events: rawEvents.flatMap((raw) => {
      const item = event(raw);
      return item ? [item] : [];
    }),
    opens,
    opensCapped: o?.capped === true,
  };
}

export type BrowserEventCheck = {
  id: string;
  hash: "matches" | "mismatch" | "unavailable";
  link: "matches" | "mismatch" | "first" | "earlier event";
};
export type BrowserRecordCheck = {
  events: BrowserEventCheck[];
  hashesChecked: number;
  hashFailures: number;
  linksChecked: number;
  linkFailures: number;
  sequenceComplete: boolean | null;
  head: "matches" | "mismatch" | "unavailable";
};

/** Runs in the merchant's browser. A hash/link check is not a signature check. */
export async function checkInkInspection(
  inspection: InkInspection,
): Promise<BrowserRecordCheck> {
  const chain = inspection.events
    .filter((item) => !item.legacy)
    .sort((a, b) => (a.sequence ?? 0) - (b.sequence ?? 0));
  const earlier = inspection.events.filter((item) => item.legacy);
  const results: BrowserEventCheck[] = [];
  let hashesChecked = 0,
    hashFailures = 0,
    linksChecked = 0,
    linkFailures = 0;
  let sequenceComplete: boolean | null = chain.length ? true : null;
  for (const [index, item] of [...chain, ...earlier].entries()) {
    let hash: BrowserEventCheck["hash"] = "unavailable";
    if (item.signedBytes != null && item.payloadHash != null) {
      const digest = await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode(item.signedBytes),
      );
      const computed = Array.from(new Uint8Array(digest), (byte) =>
        byte.toString(16).padStart(2, "0"),
      ).join("");
      hash =
        computed.toLowerCase() === item.payloadHash.toLowerCase()
          ? "matches"
          : "mismatch";
      hashesChecked += 1;
      if (hash === "mismatch") hashFailures += 1;
    }
    let link: BrowserEventCheck["link"] = "earlier event";
    if (!item.legacy) {
      const previous = index ? chain[index - 1] : null;
      const matches = previous
        ? item.previousEventId === previous.id &&
          item.previousHash === previous.payloadHash
        : item.previousEventId == null && item.previousHash == null;
      link = previous
        ? matches
          ? "matches"
          : "mismatch"
        : matches
          ? "first"
          : "mismatch";
      linksChecked += 1;
      if (!matches) linkFailures += 1;
      if (item.sequence !== (previous?.sequence ?? 0) + 1)
        sequenceComplete = false;
    }
    results.push({ id: item.id, hash, link });
  }
  const last = chain.at(-1);
  const head = !inspection.chainHead
    ? "unavailable"
    : last &&
        last.sequence === inspection.chainHead.sequence &&
        last.id === inspection.chainHead.eventId &&
        (!inspection.chainHead.payloadHash ||
          last.payloadHash === inspection.chainHead.payloadHash)
      ? "matches"
      : "mismatch";
  return {
    events: results,
    hashesChecked,
    hashFailures,
    linksChecked,
    linkFailures,
    sequenceComplete,
    head,
  };
}
