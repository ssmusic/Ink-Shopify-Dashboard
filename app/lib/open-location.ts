// THE ORDER'S OWN WORD, AS THE PROOF DOOR SAYS IT (ink-backend #132).
//
// GET {api}/proofs/:id answers `open_location` beside the proof: the FIRST
// HUMAN OPEN's own location word, its own distance and radius, and the first
// measurement another open made said beside it as `later_share` — one reader
// on the backend (utils/auditPacket.js openWordOf), the same law as the
// record's open element.
//
// The proof's two raw stamps are never read side by side for it:
//   · gps_verdict was, until #132, the proof's rollup — an older world's first
//     tap stamped it 'pass' (the default until ink-backend #99) on buyers who
//     declined, and nothing clears it (Steve Madden #1027 read "pass");
//   · first_tap_distance_to_shipping_m is the distance the first open that
//     MEASURED stored — any open's, often a later one's or a late share's.
// A door that does not carry open_location (a backend before #132) gives no
// reading here, and the caller says what it said before or nothing.
//
// Pure, no server-only import: the order page's projection and the ink
// timeline both read it.

export type OpenLocation = {
  verdict: string;
  distance_m: number | null;
  accuracy_m: number | null;
};

const MEASURED = new Set(["pass", "near", "flagged"]);

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);

/** The door's reading of the order's first open, or null when the door gave none. */
export function openLocationOf(value: unknown): OpenLocation | null {
  if (!value || typeof value !== "object") return null;
  const o = value as Record<string, unknown>;
  const verdict = typeof o.verdict === "string" && o.verdict.trim() ? o.verdict.trim() : null;
  if (!verdict) return null;
  const d = num(o.distance_m);
  const accuracy = num(o.accuracy_m);
  return {
    verdict,
    // A distance belongs to a measured word only — never "0 m", never beside
    // a word that measured nothing.
    distance_m: MEASURED.has(verdict.toLowerCase()) && d != null && d > 0 ? d : null,
    accuracy_m: accuracy != null && accuracy >= 0 ? accuracy : null,
  };
}
