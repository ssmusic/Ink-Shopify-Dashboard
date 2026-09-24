// THE LAST OPEN — the order's most recent person's open, as the merchant's
// opens door (and the proof door) serve it (ink-backend #142, `last_open`).
//
// Sam, 2026-09-24, on the console's Interaction Timeline, with two coarse
// opens half a world away reading "Not shared" and no map: "why isnt the map resolving?
// fix this" — then "i really dont need a delivery address as much as i need
// a tap address. the interaction timeline should have a smaller delivery add
// and last tap address … make sure it persists to the thin clients in the
// ritualist and ink shopify app."
//
// The backend is the one author: which open is the last (never a reload's
// fire, never a link scanner's visit), its distance (a coarse fix's too, its
// accuracy said beside it), its device word and the place in words (the same
// words the console's tap rows show). This file reads the field and says it
// in the record's own sentences. Pure: the loader and the screen both read it.
// The point is for the map only: nothing here prints a coordinate.
//
// `undefined` from readLastOpen is a door that served no field (a backend
// before #142): the screen keeps the first open's block. `null` is a door that
// answered "no last open".
//
// Every visible string is PLACEHOLDER copy, the record's own — Sam's words
// replace it.

import { accuracyWords, distanceWords, type MapPoint } from "./every-open";
import { when } from "./record-words";

export type LastOpen = {
  at: string | null;
  /** For the map only — never printed. */
  point: MapPoint | null;
  accuracy_m: number | null;
  distance_m: number | null;
  device: string | null;
  address_words: string | null;
};

const DEVICE_WORDS = new Set(["iPhone", "iPad", "Android", "Windows", "Mac", "Linux", "Other"]);
const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const text = (v: unknown): string | null => (typeof v === "string" && v.trim() ? v.trim().slice(0, 300) : null);

function pointOf(lat: unknown, lng: unknown): MapPoint | null {
  const a = finite(lat);
  const b = finite(lng);
  if (a == null || b == null || (a === 0 && b === 0) || a < -90 || a > 90 || b < -180 || b > 180) return null;
  return { lat: a, lng: b };
}

/** A door's `last_open`, field by field. undefined: no such field; null: none. */
export function readLastOpen(body: unknown): LastOpen | null | undefined {
  if (!body || typeof body !== "object" || !("last_open" in body)) return undefined;
  const raw = (body as { last_open?: unknown }).last_open;
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const accuracy = finite(r.accuracy_m);
  const distance = finite(r.distance_m);
  return {
    at: text(r.at),
    point: pointOf(r.lat, r.lng),
    accuracy_m: accuracy != null && accuracy >= 0 ? accuracy : null,
    distance_m: distance != null && distance > 0 ? distance : null,
    device: typeof r.device === "string" && DEVICE_WORDS.has(r.device) ? r.device : null,
    address_words: text(r.address_words),
  };
}

/** The first door of the two that answered the field, else undefined. */
export function lastOpenFrom(...bodies: unknown[]): LastOpen | null | undefined {
  for (const b of bodies) {
    const l = readLastOpen(b);
    if (l !== undefined) return l;
  }
  return undefined;
}

const accuracyTail = (m: number | null) => (m != null ? ` Accuracy ${accuracyWords(m)}.` : "");

/** The last open in the record's sentences. */
export function lastOpenSentence(l: LastOpen): string {
  if (l.distance_m != null) return `Opened ${distanceWords(l.distance_m)} from the delivery address.${accuracyTail(l.accuracy_m)}`;
  if (l.point) return `A location was shared, but no distance was stored.${accuracyTail(l.accuracy_m)}`;
  return "Location not shared.";
}

/** When, and on what: "Sep 24, 2026, 2:21 AM UTC · Windows". */
export function lastOpenMoment(l: LastOpen): string {
  return [l.at ? when(l.at) : null, l.device].filter(Boolean).join(" · ");
}
