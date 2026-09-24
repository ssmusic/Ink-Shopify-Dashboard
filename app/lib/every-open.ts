// THE OPEN AND EVERY OPEN — the record page's open section, for ink's order
// Advanced. Pure: no server import, so the loader builds the rows with it and
// the screen words them with it.
//
// Sam, 2026-09-23, of the Ritualist's Advanced section: "look at what you
// added to the ritualist advanced site / so amazing / can you add it to the
// polaris ink app order details page?" — then, of its words ("OUTSIDE · 2.6
// km", "beyond the 300 m range", "100 m pass · 300 m near — ink's default"):
// "we dont judge delivery so this is weird."
//
// Ported from the-ritualist src/components/ProofDetails.tsx (openVsAddress,
// RangeDiagram, OpenRowDetail, the Every open table) and src/lib/audit-packet.ts
// (openLog, openBrowserWords), with the record page's own words as its session
// "The record page never judges a delivery" cut them the same night: a
// distance is data ("Opened 2.6 km from the delivery address."), the 100 m and
// 300 m rings are scale guides named only by their radius, and no word, badge,
// colour or dash says within, near or outside. The backend's verdict rides
// along as data only: it says whether a location was shared at all.
//
// Two departures, both the app's: nothing here prints a coordinate (the map
// draws the point; the words say the distance), and the device column reads
// the browser's device word — the only device word the merchant's own doors
// carry (ink-backend utils/auditPacket.js browsers) — else the network the
// open signed, else "not recorded".
//
// Every visible string is PLACEHOLDER copy, the record page's — Sam's words
// replace it.

import { kmOrM } from "./order-timeline";

/** A distance in words, as the record page says it: "56 m", "2.6 km",
 *  "13,227 km" (2026-09-24 — a coarse fix 13,227 km away read "13226.9 km"
 *  through the shared kmOrM, which other flavours' words keep). The ink
 *  screens' Every open and last open only. */
export function distanceWords(m: number): string {
  return m >= 1000 ? `${(m / 1000).toLocaleString("en-US", { maximumFractionDigits: m >= 10000 ? 0 : 1 })} km` : `${Math.round(m)} m`;
}

export type MapPoint = { lat: number; lng: number };

/** One signed open, as the whole record read projects it on the server
 *  (services/every-open.server.ts): words and numbers only — never a hash,
 *  a signed byte, a browser's id or a coordinate. */
export type RecordOpen = {
  event_id: string;
  at: string | null;
  /** A pre-chain open: signed, not linked to the one before it. */
  legacy: boolean;
  /** The open's own signed word when it was not a person's: "stale" | "proxy". */
  outcome: string | null;
  /** "browser A" · "browser unknown" · "not counted". */
  browser: string;
  /** The browser's device word ("iPhone"), when the record counted that browser. */
  device: string | null;
  /** The network the open signed ("wifi"), when it did. */
  network: string | null;
  /** The signed measurement — the open's own, else its late share's. Data, never printed as a judgment. */
  verdict: string | null;
  distance_m: number | null;
  accuracy_m: number | null;
  /** The location came from the late share, signed as its own event. */
  shared_later: boolean;
  share_event_id: string | null;
  /** The server's check of this event's signature against the published key, in words. */
  check: string;
};

/** One row of the opens door (ink-backend routes/api/merchantOpens.js): the
 *  open's own time, word, distance, accuracy and fix — the fix for the map.
 *  Since ink-backend #135 the door also names each open's device word, its
 *  browser's letter and its kind; a door before it carries none of the three
 *  (undefined), and the row is read as before. */
export type DoorOpen = {
  at: string | null;
  outcome: string | null;
  verdict: string | null;
  distance_m: number | null;
  accuracy_m: number | null;
  lat: number | null;
  lng: number | null;
  /** THIS open's device word ("iPhone"), off its own row. */
  device?: string | null;
  /** The record's letter for the open's browser ("A"). */
  browser?: string | null;
  /** The record's word for the open: the first person's open, again, a reload, a scanner's visit.
   *  null: the door read a capped history and declines to say whether this row is the first
   *  open — never guessed "first" here. Absent (undefined): a door before #135. */
  kind?: OpenKind | null;
};

/** "unknown": the door declined to say (a capped history), and nothing earlier on
 *  the record settles it. */
export type OpenKind = "first" | "again" | "reload" | "scanner" | "unknown";

/** One row of Every open. */
export type EveryOpenRow = {
  n: number;
  at: string | null;
  /** The signed open this row is, when the record has one. */
  event_id: string | null;
  signed: boolean;
  check: string | null;
  legacy: boolean;
  shared_later: boolean;
  share_event_id: string | null;
  /** For the map only — never printed. */
  lat: number | null;
  lng: number | null;
  verdict: string | null;
  distance_m: number | null;
  accuracy_m: number | null;
  kind: OpenKind;
  device: string | null;
  network: string | null;
  browser: string | null;
};

/** The words for a fix: any of these says the device shared one. */
const SHARED = new Set(["pass", "near", "flagged", "imprecise", "unmeasured"]);
const MEASURED = new Set(["pass", "near", "flagged"]);
const NON_HUMAN = new Set(["stale", "proxy"]);

export const NOT_RECORDED = "not recorded";

const time = (iso: string | null | undefined): number | null => {
  const t = iso ? Date.parse(iso) : NaN;
  return Number.isFinite(t) ? t : null;
};
const finite = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** A point the map may draw: on the globe, and not Null Island. */
export function pointOf(lat: unknown, lng: unknown): MapPoint | null {
  const a = finite(lat);
  const b = finite(lng);
  if (a == null || b == null || (a === 0 && b === 0) || a < -90 || a > 90 || b < -180 || b > 180) return null;
  return { lat: a, lng: b };
}

/** The word a row wears only when it was not a person's. */
function nonHuman(outcome: unknown): string | null {
  const v = typeof outcome === "string" ? outcome.toLowerCase() : "";
  return NON_HUMAN.has(v) ? v : null;
}

/** A row's distance: a measured word's own; and — A COARSE FIX IS A FIX
 *  (Sam, 2026-09-24: "why isnt the map resolving? fix this") — for any fix
 *  the door measured whatever its radius (ink-backend #142), when the word
 *  does not say nothing was shared. A real, positive number only. */
function distanceOf(verdict: string | null, d: number | null, hasFix = false): number | null {
  if (d == null || !(d > 0)) return null;
  const word = (verdict ?? "").toLowerCase();
  if (MEASURED.has(word)) return d;
  return hasFix && word !== "not_shared" ? d : null;
}

/** Every open the record knows, oldest first — the record page's open log.
 *  The opens door's rows lead when it answered (they carry the fix); each is
 *  joined to the signed open at the same moment (±2 s); signed opens no row
 *  describes are listed on their own. A signed open's own measurement wins
 *  over the row's. The first open that was a person's is the first open. */
export function everyOpenRows(door: DoorOpen[] | null | undefined, signed: RecordOpen[] | null | undefined): EveryOpenRow[] {
  const opens = (signed ?? []).filter((e) => time(e.at) != null).slice().sort((a, b) => (time(a.at) as number) - (time(b.at) as number));
  const used = new Set<string>();
  type Draft = Omit<EveryOpenRow, "n" | "kind"> & { outcome: string | null; doorKind: OpenKind | null | undefined };
  const rows: Draft[] = [];
  const signedSide = (m: RecordOpen) => ({
    event_id: m.event_id,
    signed: true,
    check: m.check,
    legacy: m.legacy,
    shared_later: m.shared_later,
    share_event_id: m.share_event_id,
    device: m.device,
    network: m.network,
    browser: m.browser,
  });
  const unsigned = { event_id: null, signed: false, check: null, legacy: false, shared_later: false, share_event_id: null, device: null, network: null, browser: null };

  for (const t of (door ?? []).filter((r) => time(r.at) != null).slice().sort((a, b) => (time(a.at) as number) - (time(b.at) as number))) {
    const at = time(t.at) as number;
    const match = opens.find((e) => !used.has(e.event_id) && Math.abs((time(e.at) as number) - at) <= 2000) ?? null;
    if (match) used.add(match.event_id);
    const fix = pointOf(t.lat, t.lng);
    // The signed measurement wins when the open signed one; else the row's own.
    const own = match && match.verdict ? match : null;
    const verdict = own ? own.verdict : t.verdict;
    const side = match ? signedSide(match) : unsigned;
    rows.push({
      at: t.at,
      ...side,
      // The door's words for THIS open win: its own device word, its browser's
      // letter; the signed side's (the browser's device, "browser unknown")
      // stand where the door has none.
      device: t.device ?? side.device,
      browser: t.browser ? `browser ${t.browser}` : side.browser,
      lat: fix?.lat ?? null,
      lng: fix?.lng ?? null,
      verdict: verdict ?? null,
      // The signed distance when the open signed one; else the door's for
      // this fix — a coarse fix's too (ink-backend #142).
      distance_m: distanceOf(verdict ?? null, (own ? own.distance_m : null) ?? t.distance_m, !!fix),
      accuracy_m: own ? own.accuracy_m ?? t.accuracy_m : t.accuracy_m,
      outcome: match ? nonHuman(match.outcome) : nonHuman(t.outcome),
      doorKind: t.kind,
    });
  }
  // A signed open no row describes: its words, and no point for the map.
  for (const e of opens) {
    if (used.has(e.event_id)) continue;
    rows.push({
      at: e.at,
      ...signedSide(e),
      lat: null,
      lng: null,
      verdict: e.verdict,
      distance_m: distanceOf(e.verdict, e.distance_m),
      accuracy_m: e.accuracy_m,
      outcome: nonHuman(e.outcome),
      doorKind: undefined,
    });
  }
  rows.sort((a, b) => (time(a.at) ?? 0) - (time(b.at) ?? 0));
  // The door's word for an open's kind wins (it knows a re-open the page
  // called a reload); where the door gave none, the record's signed word and
  // the order of the rows say it.
  const doorSaysFirst = rows.some((r) => r.doorKind === "first");
  let firstSeen = false;
  return rows.map(({ outcome, doorKind, ...r }, i) => {
    let kind: OpenKind;
    if (doorKind) kind = doorKind;
    else if (outcome === "proxy") kind = "scanner";
    else if (outcome === "stale") kind = "reload";
    // The door declined to say (a capped history): "again" only when an
    // earlier open on the record is already the first; never a guessed first.
    else if (doorKind === null) kind = firstSeen ? "again" : "unknown";
    else if (!firstSeen && !doorSaysFirst) kind = "first";
    else kind = "again";
    if (kind === "first") firstSeen = true;
    return { ...r, n: i + 1, kind };
  });
}

// ── The words of a row ─────────────────────────────────────────────────────

/** A radius in words: "±40 m", "±3.2 km". */
export function accuracyWords(m: number): string {
  return `±${kmOrM(m)}`;
}

/** Whether the row's device shared a location. */
export function sharedOf(row: Pick<EveryOpenRow, "lat" | "lng" | "verdict">): boolean {
  return (row.lat != null && row.lng != null) || SHARED.has(String(row.verdict ?? "").toLowerCase());
}

/** A distance that never breaks between its number and its unit. */
const cellDistance = (m: number) => distanceWords(m).replace(" ", "\u00a0");

/** The Location column: "location shared · 2.6 km from the address" · "location shared" · "not shared". */
export function locationCell(row: EveryOpenRow): string {
  if (!sharedOf(row)) return "not shared";
  return row.distance_m != null ? `location shared · ${cellDistance(row.distance_m)} from the address` : "location shared";
}

/** The Device column: the browser's device word, else the network the open signed. */
export function deviceCell(row: EveryOpenRow): string {
  if (row.device) return row.device;
  if (row.network) return `${row.network} network`;
  return NOT_RECORDED;
}

/** The Browser column: the record's name for the open's browser. */
export function browserCell(row: EveryOpenRow): string {
  return row.browser ?? NOT_RECORDED;
}

/** The Open column. */
export const KIND_WORDS: Record<OpenKind, string> = {
  first: "first open",
  again: "opened again",
  reload: "a reload's fire, not the open",
  scanner: "not a person's — a link scanner's visit",
  unknown: NOT_RECORDED,
};

/** The Signed event column's second line: what the check found of its signature. */
export function signatureCell(check: string | null | undefined): string {
  const word = check || "not checked";
  return `Signature ${word}`;
}

export const NOT_SIGNED = "not on the signed record";

/** A row, opened: the words under its map (or in its place, with no fix).
 *  A distance is said as a distance; the accuracy only when the row carries it. */
export function rowCaption(row: EveryOpenRow, address: MapPoint | null): string {
  const accuracy = row.accuracy_m != null ? ` Accuracy ${accuracyWords(row.accuracy_m)}.` : "";
  const hasFix = row.lat != null && row.lng != null;
  if (row.distance_m != null) return `Opened ${distanceWords(row.distance_m)} from the delivery address.${accuracy}`;
  if (hasFix || sharedOf(row)) {
    const noAddress = hasFix && !address ? " The delivery address was never geocoded: the open alone, with no rings." : "";
    return `A location was shared, but no distance was stored.${accuracy}${noAddress}`;
  }
  return "Location not shared.";
}

// ── The open against the delivery address ──────────────────────────────────

/** The first open's served line, as the record's open element carries it
 *  (services/ink-record.server.ts locationProjection). */
export type ServedLocation = {
  verdict?: string | null;
  distance_m?: number | null;
  accuracy_m?: number | null;
  signed?: boolean;
  after_carrier_scan?: boolean | null;
};

export type TheOpenReading = {
  result: "measured" | "not_shared" | "unmeasured" | "imprecise" | "no_open";
  distance_m: number | null;
  accuracy_m: number | null;
  /** "signed" — inside a signed event; "record" — the record's word; "here" — the two points, measured on this screen. */
  source: "signed" | "record" | "here" | null;
  shared: boolean;
  /** The first open's point, for the diagram's bearing only. */
  fix: MapPoint | null;
  address: MapPoint | null;
  words: string;
};

/** Great-circle metres between two points — arithmetic, never a verdict. */
export function metresBetween(a: MapPoint, b: MapPoint): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const s = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lng - a.lng) / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(s));
}

/** The first open a person made that shared a point — for the diagram's bearing. */
export function firstOpenRow(rows: EveryOpenRow[] | null | undefined): EveryOpenRow | null {
  const people = (rows ?? []).filter((r) => r.kind === "first" || r.kind === "again" || r.kind === "unknown");
  return people.find((r) => r.lat != null && r.lng != null) ?? null;
}

/** The first open against the delivery address, in the record page's words
 *  as cut on 2026-09-23: the distance is data; nothing is judged. */
export function theOpenReading(input: {
  served: ServedLocation | null | undefined;
  rows: EveryOpenRow[] | null | undefined;
  address: MapPoint | null;
  opens: number;
}): TheOpenReading {
  const served = input.served ?? null;
  const verdict = typeof served?.verdict === "string" ? served.verdict.toLowerCase() : null;
  const accuracy = finite(served?.accuracy_m ?? null);
  const first = firstOpenRow(input.rows);
  const fix = first ? { lat: first.lat as number, lng: first.lng as number } : null;
  const address = input.address;
  const servedD = verdict && MEASURED.has(verdict) ? finite(served?.distance_m ?? null) : null;
  const opens = Math.max(input.opens, (input.rows ?? []).length);
  // A COARSE FIX IS A FIX (Sam, 2026-09-24): a word the record signed no
  // distance for through a wide radius ('imprecise') is measured like any
  // fix — the door's distance for it (ink-backend #142), else here from the
  // two points — its accuracy said beside it.
  const doorD = servedD == null && verdict === "imprecise" && first?.distance_m != null ? first.distance_m : null;
  const here = servedD == null && doorD == null && fix && address ? Math.round(metresBetween(fix, address)) : null;
  const d = servedD != null ? Math.round(servedD) : doorD != null ? Math.round(doorD) : here;
  const source: TheOpenReading["source"] = servedD != null ? (served?.signed ? "signed" : "record") : doorD != null ? "record" : here != null ? "here" : null;
  const shared = !!fix || (verdict != null && SHARED.has(verdict));
  const base = { accuracy_m: accuracy, source, shared, fix, address };
  const tail = address ? " The delivery address is on file and is shown below." : " The delivery address is not geocoded on this row.";

  if (verdict === "imprecise" && d == null) {
    return { ...base, result: "imprecise", distance_m: null, source: served?.signed ? "signed" : "record", words: `A location was shared, but no distance was stored.${accuracy != null ? ` Accuracy ${accuracyWords(accuracy)}.` : ""}${tail}` };
  }
  if (!opens && !shared) {
    return { ...base, result: "no_open", distance_m: null, words: address ? "No open on the record yet. The delivery address is on file and is shown below." : "No open on the record yet, and the delivery address is not geocoded on this row." };
  }
  if (!shared) {
    return { ...base, result: "not_shared", distance_m: null, words: address ? "No open shared a location, so the distance could not be measured. The delivery address is on file and is shown below." : "No open shared a location, and the delivery address is not geocoded on this row." };
  }
  if (d == null) {
    return { ...base, result: "unmeasured", distance_m: null, words: address ? "A location was shared, but no distance was stored." : "The delivery address is not geocoded on this row, so there is nothing to measure the open against. The open's location was recorded." };
  }
  const after = served?.after_carrier_scan;
  const when = after === false ? " Before the carrier's scan." : after === true ? " After the carrier's scan." : "";
  const measured = source === "here" ? " Measured here from the two points, not by ink." : "";
  const wide = verdict === "imprecise" && accuracy != null ? ` Accuracy ${accuracyWords(accuracy)}.` : "";
  return { ...base, result: "measured", distance_m: d, words: `Opened ${distanceWords(d)} from the delivery address.${wide}${when}${measured}` };
}

/** The order's FIRST open in one line, for the last open's block: its own
 *  served word — the distance with its accuracy and where it stood against
 *  the carrier's scan; a coarse first open measured from its own point; or
 *  that it shared nothing. PLACEHOLDER copy, the record's own sentences. */
export function firstOpenLine(input: { served: ServedLocation | null | undefined; rows: EveryOpenRow[] | null | undefined; address: MapPoint | null; opens: number }): string {
  const served = input.served ?? null;
  const verdict = typeof served?.verdict === "string" ? served.verdict.toLowerCase() : null;
  if (!served || !verdict) return input.opens || (input.rows ?? []).length ? NOT_RECORDED : "No open on the record yet.";
  const accuracy = finite(served.accuracy_m ?? null);
  const tail = accuracy != null ? ` Accuracy ${accuracyWords(accuracy)}.` : "";
  const after = served.after_carrier_scan;
  const when = after === false ? " Before the carrier's scan." : after === true ? " After the carrier's scan." : "";
  const d = MEASURED.has(verdict) ? finite(served.distance_m ?? null) : null;
  if (d != null) return `Opened ${distanceWords(d)} from the delivery address.${tail}${when}`;
  if (verdict === "not_shared") return "Location not shared.";
  const first = (input.rows ?? []).find((r) => r.kind === "first") ?? null;
  const own = first && first.lat != null && first.lng != null ? { lat: first.lat, lng: first.lng } : null;
  const measured = first?.distance_m ?? (own && input.address ? Math.round(metresBetween(own, input.address)) : null);
  if (measured != null) return `Opened ${distanceWords(measured)} from the delivery address.${tail}${when}`;
  return `A location was shared, but no distance was stored.${tail}`;
}

/** The line under the words that names the signed event the location stands on. */
export function theOpenEventLine(rows: EveryOpenRow[] | null | undefined): string | null {
  const first = firstOpenRow(rows);
  if (!first || !first.signed || !first.event_id) return null;
  if (first.shared_later && first.share_event_id) return `shared on the first open · ${first.share_event_id}`;
  return `${first.legacy ? "the first open's location · pre-chain" : "the first open's location"} · ${first.event_id}`;
}

/** The Buyer's device fact. */
export function deviceFact(v: TheOpenReading): string {
  const radius = v.accuracy_m != null ? ` · ${accuracyWords(v.accuracy_m)}` : "";
  if (v.shared) return `location shared${radius}`;
  return v.result === "not_shared" ? "not shared" : NOT_RECORDED;
}

/** The Distance fact: the distance and where it came from. */
export function distanceFact(v: TheOpenReading): string {
  if (v.distance_m == null) return NOT_RECORDED;
  return `${distanceWords(v.distance_m)} · ${v.source === "signed" ? "signed" : v.source === "record" ? "the record's word" : "measured here"}`;
}

export const CORROBORATING =
  "A corroborating signal, not what confirms the open. The signed open proves the page was opened; the location shows where the device said it was, only when the buyer allowed it, and can be declined.";

// ── The rings diagram ──────────────────────────────────────────────────────

/** The two scale guides, in metres, drawn around the address. Guides only:
 *  no word, colour or dash says inside or outside of them. */
export const GUIDE_RINGS_M = [100, 300] as const;

export type RingsGeometry = {
  width: number;
  height: number;
  cx: number;
  cy: number;
  /** Each guide's drawn radius, its label and where the label sits, inner first. */
  rings: { metres: number; r: number; label: string; lx: number; ly: number }[];
  /** Where the address's name sits. */
  address: { x: number; y: number };
  /** The open's place and the line's middle — null when nothing was measured. */
  open: { x: number; y: number; mx: number; my: number; label: string } | null;
  /** When nothing was measured: what the diagram says instead. */
  caption: string | null;
};

/** The record page's diagram, one device: the address at the centre, the two
 *  guides, the open at its true bearing when both points are known (else up
 *  and to the right), its radius linear inside the outer guide and a soft cap
 *  beyond it so 2,000 km still draws. The names — "address" and each ring's
 *  radius — stand on the side away from the open, so the line and its
 *  distance never cover them; with no open, above. */
export function ringsGeometry(v: TheOpenReading): RingsGeometry {
  // The record page's 280 × 200, with room below for an open due south.
  const width = 280;
  const height = 220;
  const cx = 140;
  const cy = 110;
  const innerR = 44;
  const outerR = 78;
  const [inner, outer] = GUIDE_RINGS_M;
  const measured = v.result === "measured" && v.distance_m != null;
  const off = v.fix && v.address
    ? { x: (v.fix.lng - v.address.lng) * 111320 * Math.cos((v.address.lat * Math.PI) / 180), y: (v.fix.lat - v.address.lat) * 110540 }
    : { x: 0.7, y: 0.7 };
  const norm = Math.hypot(off.x, off.y) || 1;
  const ux = off.x / norm;
  const uy = off.y / norm;
  // The names' side: opposite the open (a unit vector, north up), else north.
  const nx = measured ? -ux : 0;
  const ny = measured ? -uy : 1;
  const at = (distance: number) => ({ x: cx + nx * distance, y: cy - ny * distance + 3 });
  const place = (r: number) => at(r + 9);
  const rings = [
    { metres: inner, r: innerR, label: `${inner} m`, lx: place(innerR).x, ly: place(innerR).y },
    { metres: outer, r: outerR, label: `${outer} m`, lx: place(outerR).x, ly: place(outerR).y },
  ];
  const address = at(24);
  if (!measured) {
    const caption = v.result === "not_shared" ? "location not shared" : v.result === "no_open" ? "no open" : "unmeasured";
    return { width, height, cx, cy, rings, address, open: null, caption };
  }
  const d = v.distance_m as number;
  const rp = Math.min(outerR + 18, d <= outer ? (d / outer) * outerR : outerR + 6 + Math.log10(d / outer) * 6);
  const x = cx + ux * rp;
  const y = cy - uy * rp;
  return { width, height, cx, cy, rings, address, open: { x, y, mx: (cx + x) / 2, my: (cy + y) / 2, label: distanceWords(d) }, caption: null };
}
