import type {
  RecordElement,
  RecordRead,
  RecordSummary,
} from "../lib/record-words";

import { merchantRead, PROOF_ID } from "./ink-reader.server";

function locationProjection(
  value: unknown,
  includeLater = true,
): Record<string, unknown> | null {
  if (!value || typeof value !== "object") return null;
  const v = value as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  if (typeof v.verdict === "string") out.verdict = v.verdict;
  for (const key of ["distance_m", "accuracy_m"])
    if (
      typeof v[key] === "number" &&
      Number.isFinite(v[key]) &&
      Number(v[key]) >= 0
    )
      out[key] = v[key];
  if (typeof v.signed === "boolean") out.signed = v.signed;
  if (includeLater && v.later_share)
    out.later_share = locationProjection(v.later_share, false);
  return out;
}

/** The words of one record, or null. */
export function recordFromBody(body: unknown): RecordRead | null {
  const b = body as {
    summary?: RecordSummary;
    verdict?: { elements?: unknown[] };
    record?: {
      locked?: unknown;
      purchased?: unknown;
      price_cents?: unknown;
      currency?: unknown;
    };
    chain?: unknown[];
    legacy_events?: unknown[];
  } | null;
  if (!b || typeof b !== "object" || !Array.isArray(b.verdict?.elements))
    return null;
  const elements: RecordElement[] = [];
  for (const e of b.verdict!.elements!) {
    const el = e as Partial<RecordElement> | null;
    if (!el || typeof el.element !== "string" || typeof el.label !== "string")
      continue;
    elements.push({
      element: el.element,
      label: el.label,
      status: typeof el.status === "string" ? el.status : "missing",
      value:
        el.value && typeof el.value === "object"
          ? Object.fromEntries(
              Object.entries(el.value)
                .filter(([key]) =>
                  [
                    "order_number",
                    "enrolled_at",
                    "tier",
                    "delivered_at",
                    "source",
                    "signed",
                    "geocoded",
                    "verified_at_door",
                    "last_status",
                    "last_at",
                    "carrier",
                    "signed_delivered_at",
                    "first_open_at",
                    "first_open_signed",
                    "opens",
                    "signed_opens",
                    "non_human_opens",
                    "location",
                  ].includes(key),
                )
                .map(([key, value]) => [
                  key,
                  key === "location"
                    ? locationProjection(value)
                    : typeof value === "string" ||
                        typeof value === "boolean" ||
                        (typeof value === "number" && Number.isFinite(value))
                      ? value
                      : null,
                ]),
            )
          : null,
    });
  }
  const summary: RecordSummary = {};
  for (const key of [
    "order_number",
    "enrolled_at",
    "delivered_at",
    "delivery_stage",
    "carrier",
    "first_open_at",
    "last_open_at",
  ] as const) {
    if (typeof b.summary?.[key] === "string") summary[key] = b.summary[key];
  }
  summary.opens =
    typeof b.summary?.opens === "number" &&
    Number.isFinite(b.summary.opens) &&
    b.summary.opens >= 0
      ? b.summary.opens
      : null;
  const cents = b.record?.price_cents;
  const currency = b.record?.currency;
  const price =
    Number.isInteger(cents) &&
    Number(cents) > 0 &&
    Number(cents) <= 1000000 &&
    typeof currency === "string" &&
    /^[A-Z]{3}$/.test(currency)
      ? { price_cents: Number(cents), currency }
      : null;
  const locked = b.record?.locked === true;
  const rawEvents = !locked
    ? [...(Array.isArray(b.chain) ? b.chain : []), ...(Array.isArray(b.legacy_events) ? b.legacy_events : [])]
    : [];
  const events = rawEvents.slice(0, 50).flatMap((raw) => {
    if (!raw || typeof raw !== "object") return [];
    const event = raw as Record<string, unknown>;
    if (typeof event.event_id !== "string" || !/^event_[a-zA-Z0-9_-]{8,80}$/.test(event.event_id)) return [];
    return [{
      id: event.event_id,
      type: typeof event.event_type === "string" ? event.event_type.slice(0, 80) : "Event",
      at: typeof event.timestamp === "string" && !Number.isNaN(Date.parse(event.timestamp)) ? event.timestamp : null,
      sequence: Number.isSafeInteger(event.seq) ? Number(event.seq) : null,
      signed: typeof event.signature === "string" && event.signature.length > 0,
      hash: typeof event.payload_hash === "string" && event.payload_hash.length > 0,
      legacy: event.legacy === true,
    }];
  });
  return { summary, elements, locked, price, events, eventCount: rawEvents.length };
}

export async function readRecord(
  apiKey: string | null | undefined,
  proofId: string,
  fetchImpl: typeof fetch = fetch,
): Promise<RecordRead | null> {
  if (!PROOF_ID.test(proofId)) return null;
  return recordFromBody(
    await merchantRead(apiKey, `proofs/${proofId}/audit`, fetchImpl),
  );
}

export async function readRecords(
  apiKey: string | null | undefined,
  proofIds: Array<string | null>,
  fetchImpl: typeof fetch = fetch,
): Promise<Record<string, RecordRead>> {
  if (!apiKey) return {};
  const ids = [
    ...new Set(
      proofIds.filter(
        (p): p is string => typeof p === "string" && PROOF_ID.test(p),
      ),
    ),
  ];
  const reads = await Promise.all(
    ids.map(
      async (id) => [id, await readRecord(apiKey, id, fetchImpl)] as const,
    ),
  );
  return Object.fromEntries(
    reads.filter((r): r is readonly [string, RecordRead] => r[1] !== null),
  );
}
