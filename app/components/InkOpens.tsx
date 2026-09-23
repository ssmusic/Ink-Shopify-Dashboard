// THE OPEN AND EVERY OPEN — the record page's open section, in ink's order
// Advanced.
//
// Sam, 2026-09-23, with the Ritualist's Advanced section on screen: "look at
// what you added to the ritualist advanced site / so amazing / can you add it
// to the polaris ink app order details page?" — then, of its words: "we dont
// judge delivery so this is weird." So this is the record page's structure
// (the-ritualist src/components/ProofDetails.tsx OpenVsAddress, RangeDiagram,
// OpenRowDetail and the Every open table) in Polaris, with its words as they
// were cut that night (lib/every-open.ts):
//   · THE OPEN — the buyer's device against the delivery address: the first
//     open's distance as data, the 100 m and 300 m rings as scale guides with
//     the address at the centre and the open at its bearing, the delivery
//     address on Google's map, the facts, and the sentence that says what a
//     location is and is not;
//   · EVERY OPEN — # · time · location · device · browser · open · signed
//     event, each row opening onto its own map: the address, that one open,
//     the dashed line and its distance, the guide rings.
// No badge, no range line, no colour for within: the palette's one blue marks
// the data, grey the guides (lib/ink-palette.ts). No coordinate is printed as
// text: the maps draw the points.
//
// Every visible string is PLACEHOLDER copy, the record page's — Sam's words
// replace it.

import { Fragment, useId, useState, type MouseEvent } from "react";
import { BlockStack, Button, Divider, InlineGrid, Text } from "@shopify/polaris";
import { ChevronDownIcon, ChevronUpIcon } from "@shopify/polaris-icons";
import OpensMap from "./OpensMap";
import type { OrderTimelineData } from "./OrderTimeline";
import { INK_DATA, INK_DATA_TINT, INK_HAIRLINE, INK_MUTED, INK_NEUTRAL } from "../lib/ink-palette";
import { browsersLine, opensOf, when, type RecordRead } from "../lib/record-words";
import {
  CORROBORATING,
  KIND_WORDS,
  NOT_RECORDED,
  NOT_SIGNED,
  browserCell,
  deviceCell,
  deviceFact,
  distanceFact,
  everyOpenRows,
  locationCell,
  ringsGeometry,
  rowCaption,
  signatureCell,
  theOpenEventLine,
  theOpenReading,
  type EveryOpenRow,
  type MapPoint,
  type ServedLocation,
  type TheOpenReading,
} from "../lib/every-open";

/** The first open's served line, as the record's open element carries it. */
function servedOf(record: RecordRead | null | undefined): ServedLocation | null {
  const el = record?.elements.find((e) => e.element === "the_open");
  const loc = (el?.value as { location?: unknown } | null)?.location;
  return loc && typeof loc === "object" ? (loc as ServedLocation) : null;
}

/** The record page's diagram: the address at the centre, the two guides named
 *  by their radius, the open at its bearing with the distance on the line —
 *  and when nothing was measured, the guides alone with what the record says. */
export function OpenRings({ v }: { v: TheOpenReading }) {
  const g = ringsGeometry(v);
  const [inner, outer] = g.rings;
  const label = g.open
    ? `The open, ${g.open.label} from the delivery address, with ${inner.label} and ${outer.label} rings`
    : `The delivery address with ${inner.label} and ${outer.label} rings; ${g.caption}`;
  return (
    <svg
      viewBox={`0 0 ${g.width} ${g.height}`}
      width="100%"
      role="img"
      aria-label={label}
      data-testid="the-open-rings"
      style={{ display: "block", maxHeight: 220, background: "var(--p-color-bg-surface)", border: "1px solid var(--p-color-border)", borderRadius: "var(--p-border-radius-200)" }}
    >
      {[outer, inner].map((ring) => (
        <circle key={ring.metres} cx={g.cx} cy={g.cy} r={ring.r} fill="none" stroke={INK_MUTED} strokeWidth={1} strokeDasharray="3 4" />
      ))}
      {[outer, inner].map((ring) => (
        <text key={ring.metres} x={ring.lx} y={ring.ly} textAnchor="middle" fontSize={8.5} fill={INK_MUTED} stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
          {ring.label}
        </text>
      ))}
      {g.open ? (
        <>
          <line x1={g.cx} y1={g.cy} x2={g.open.x} y2={g.open.y} stroke={INK_DATA} strokeWidth={1.5} strokeDasharray="4 3" />
          <g transform={`translate(${g.open.mx}, ${g.open.my})`}>
            <rect x={-26} y={-9} width={52} height={18} rx={9} fill="#ffffff" stroke={INK_HAIRLINE} strokeWidth={1} />
            <text x={0} y={3.5} textAnchor="middle" fontSize={10} fontWeight={600} fill={INK_NEUTRAL}>
              {g.open.label}
            </text>
          </g>
        </>
      ) : null}
      {/* the address */}
      <circle cx={g.cx} cy={g.cy} r={11} fill={INK_NEUTRAL} stroke="#ffffff" strokeWidth={2.5} />
      <circle cx={g.cx} cy={g.cy} r={3.5} fill="#ffffff" />
      <text x={g.address.x} y={g.address.y} textAnchor="middle" fontSize={8} fill={INK_NEUTRAL} stroke="#ffffff" strokeWidth={3} paintOrder="stroke">
        address
      </text>
      {g.open ? (
        <>
          {/* the open — drawn only when a distance was measured */}
          <circle cx={g.open.x} cy={g.open.y} r={9} fill={INK_DATA} stroke="#ffffff" strokeWidth={2.5} />
          <text x={Math.min(g.open.x + 14, g.width - 34)} y={g.open.y - 12} fontSize={8} fill={INK_NEUTRAL}>
            open
          </text>
        </>
      ) : (
        <text x={g.cx} y={g.cy + outer.r + 16} textAnchor="middle" fontSize={9} fill={INK_MUTED}>
          {g.caption}
        </text>
      )}
    </svg>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <BlockStack gap="050">
      <Text as="span" variant="bodySm" tone="subdued">
        {label}
      </Text>
      <Text as="span" breakWord>
        {value}
      </Text>
    </BlockStack>
  );
}

/** THE OPEN: the first open against the delivery address. */
export function TheOpen({
  record,
  rows,
  address,
  addressLabel = null,
  mapsKey = null,
}: {
  record: RecordRead | null | undefined;
  rows: EveryOpenRow[];
  address: MapPoint | null;
  addressLabel?: string | null;
  mapsKey?: string | null;
}) {
  const v = theOpenReading({ served: servedOf(record), rows, address, opens: opensOf(record) ?? 0 });
  const line = v.shared ? theOpenEventLine(rows) : null;
  const where = addressLabel && addressLabel !== "Address unavailable" ? addressLabel : null;
  return (
    <div data-testid="the-open">
    <BlockStack gap="400">
      <BlockStack gap="100">
        <Text as="h3" variant="headingMd">
          The open · buyer&apos;s device ↔ delivery address
        </Text>
        <Text as="p">{v.words}</Text>
        {line ? (
          <Text as="p" variant="bodySm" tone="subdued" breakWord>
            {line}
          </Text>
        ) : null}
      </BlockStack>
      <InlineGrid columns={{ xs: 1, md: 2 }} gap="400" alignItems="start">
        <OpenRings v={v} />
        <BlockStack gap="200">
          <Text as="h4" variant="headingSm">
            Delivery address
          </Text>
          {!address ? (
            <Text as="p" tone="subdued">
              not recorded — the address was never geocoded
            </Text>
          ) : mapsKey ? (
            <OpensMap apiKey={mapsKey} address={address} opens={[]} rings height={200} />
          ) : (
            <Text as="p" breakWord>
              {where ?? NOT_RECORDED}
            </Text>
          )}
        </BlockStack>
      </InlineGrid>
      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
        <Fact label="Buyer's device" value={deviceFact(v)} />
        <Fact label="Delivery address" value={where ?? NOT_RECORDED} />
        <Fact label="Distance" value={distanceFact(v)} />
      </InlineGrid>
      <Text as="p" variant="bodySm" tone="subdued">
        {CORROBORATING}
      </Text>
    </BlockStack>
    </div>
  );
}

/** A row, opened: its own map when the open carried a fix, then its words. */
export function OpenRowDetail({ row, address, mapsKey = null }: { row: EveryOpenRow; address: MapPoint | null; mapsKey?: string | null }) {
  const fix = row.lat != null && row.lng != null ? { lat: row.lat, lng: row.lng } : null;
  return (
    <BlockStack gap="200">
      {fix && mapsKey ? (
        <OpensMap
          apiKey={mapsKey}
          address={address}
          opens={[{ ...fix, distance_m: row.distance_m, label: `Open ${row.n}${row.at ? ` · ${when(row.at)}` : ""}` }]}
          rings={!!address}
          height={240}
        />
      ) : null}
      <Text as="p" variant="bodySm">
        {rowCaption(row, address)}
      </Text>
    </BlockStack>
  );
}

/** The rows a press leaves open: the pressed one flips; the others stay as they are. */
export function toggleRow(open: ReadonlySet<number>, n: number): Set<number> {
  const next = new Set(open);
  if (next.has(n)) next.delete(n);
  else next.add(n);
  return next;
}

// The table in Polaris's own tokens. A press anywhere on a row opens it; its
// chevron is the control a keyboard reaches. The opened row carries the one
// blue's tint. (No quotes inside the <style>: React's server render escapes
// them and the rule dies.)
const TABLE_CSS =
  ".ink-every-open-scroll{overflow-x:auto;border:1px solid var(--p-color-border);border-radius:var(--p-border-radius-200);container-type:inline-size}" +
  ".ink-every-open{width:100%;min-width:760px;border-collapse:collapse}" +
  ".ink-every-open th,.ink-every-open td{padding:8px 12px;text-align:left;vertical-align:top;border-bottom:1px solid var(--p-color-border-secondary)}" +
  ".ink-every-open thead th{background:var(--p-color-bg-surface-secondary);white-space:nowrap}" +
  ".ink-every-open tr.ink-every-open-row{cursor:pointer}" +
  ".ink-every-open tr.ink-every-open-row:hover{background:var(--p-color-bg-surface-hover)}" +
  `.ink-every-open tr[data-open=true],.ink-every-open tr.ink-every-open-row[data-open=true]:hover{background:${INK_DATA_TINT}}` +
  ".ink-every-open td.ink-nowrap{white-space:nowrap}" +
  ".ink-every-open td.ink-time{min-width:110px}" +
  ".ink-every-open td.ink-loc{min-width:150px}" +
  ".ink-every-open td.ink-kind{min-width:96px}" +
  ".ink-every-open td.ink-event{min-width:150px}" +
  ".ink-every-open tbody tr:last-child td{border-bottom:0}" +
  ".ink-every-open-map{position:sticky;left:12px;width:calc(100cqw - 24px)}";

const HEADINGS = ["#", "Time", "Location", "Device", "Browser", "Open", "Signed event"];

/** EVERY OPEN: each open the record knows, oldest first, each onto its own map. */
export function EveryOpen({
  rows,
  address,
  mapsKey = null,
  available = true,
  capped = false,
  browsers = null,
  recorded = null,
  defaultOpen = [],
}: {
  rows: EveryOpenRow[];
  address: MapPoint | null;
  mapsKey?: string | null;
  /** The opens door answered: every open is here. */
  available?: boolean;
  /** The opens door limited the history it returned. */
  capped?: boolean;
  /** The record's line about the browsers the opens came from. */
  browsers?: string | null;
  /** How many opens the record counts. */
  recorded?: number | null;
  /** Rows (by number) open on first render. */
  defaultOpen?: number[];
}) {
  const id = useId();
  const [open, setOpen] = useState<ReadonlySet<number>>(() => new Set(defaultOpen));
  const flip = (n: number) => setOpen((prev) => toggleRow(prev, n));
  return (
    <div data-testid="every-open-section">
    <BlockStack gap="300">
      <Text as="h3" variant="headingMd">
        {available && !capped ? "Every open" : "Open history"}
      </Text>
      {!available ? (
        <Text as="p" tone="subdued">
          The full open history is unavailable. Any details below come from the record.
        </Text>
      ) : null}
      {rows.length ? (
        <div className="ink-every-open-scroll">
          <style>{TABLE_CSS}</style>
          <table className="ink-every-open" data-testid="every-open">
            <thead>
              <tr>
                {HEADINGS.map((h) => (
                  <th key={h} scope="col">
                    <Text as="span" variant="bodySm" tone="subdued" fontWeight="medium">
                      {h}
                    </Text>
                  </th>
                ))}
                <th scope="col">
                  <Text as="span" visuallyHidden>
                    Map
                  </Text>
                </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const isOpen = open.has(r.n);
                const panel = `${id}-open-${r.n}`;
                const hasFix = r.lat != null && r.lng != null;
                return (
                  <Fragment key={r.event_id ?? `${r.n}-${r.at}`}>
                    <tr
                      className="ink-every-open-row"
                      data-open={isOpen}
                      onClick={(e: MouseEvent<HTMLTableRowElement>) => {
                        // The chevron acts for itself; selecting an event id to copy it never flips the row.
                        if ((e.target as HTMLElement).closest("button, a")) return;
                        if (typeof window !== "undefined" && window.getSelection()?.toString()) return;
                        flip(r.n);
                      }}
                    >
                      <td className="ink-nowrap">
                        <Text as="span" variant="bodySm">
                          {String(r.n)}
                        </Text>
                      </td>
                      <td className="ink-time">
                        <Text as="span" variant="bodySm">
                          {when(r.at)}
                        </Text>
                      </td>
                      <td className="ink-loc">
                        <Text as="span" variant="bodySm">
                          {locationCell(r)}
                        </Text>
                      </td>
                      <td className="ink-nowrap">
                        <Text as="span" variant="bodySm">
                          {deviceCell(r)}
                        </Text>
                      </td>
                      <td className="ink-nowrap">
                        <Text as="span" variant="bodySm">
                          {browserCell(r)}
                        </Text>
                      </td>
                      <td className={r.kind === "first" || r.kind === "again" ? "ink-nowrap" : "ink-kind"}>
                        <Text as="span" variant="bodySm">
                          {KIND_WORDS[r.kind]}
                        </Text>
                      </td>
                      <td className="ink-event">
                        {r.signed && r.event_id ? (
                          <BlockStack gap="050">
                            <Text as="span" variant="bodySm" breakWord>
                              {r.event_id}
                            </Text>
                            <Text as="span" variant="bodySm" tone="subdued">
                              {signatureCell(r.check)}
                            </Text>
                          </BlockStack>
                        ) : (
                          <Text as="span" variant="bodySm" tone="subdued">
                            {NOT_SIGNED}
                          </Text>
                        )}
                      </td>
                      <td>
                        <Button
                          variant="tertiary"
                          size="slim"
                          icon={isOpen ? ChevronUpIcon : ChevronDownIcon}
                          accessibilityLabel={hasFix ? `Map of open ${r.n}` : `Location of open ${r.n}`}
                          ariaExpanded={isOpen}
                          ariaControls={panel}
                          onClick={() => flip(r.n)}
                        />
                      </td>
                    </tr>
                    {isOpen ? (
                      <tr id={panel} data-open>
                        {/* Every column: the seven named ones and the chevron's. */}
                        <td colSpan={HEADINGS.length + 1}>
                          <div className="ink-every-open-map">
                            <OpenRowDetail row={r} address={address} mapsKey={mapsKey} />
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : available || !recorded ? (
        <Text as="p" tone="subdued">
          No open on the record yet.
        </Text>
      ) : null}
      {capped ? (
        <Text as="p" tone="subdued">
          The merchant service limited the open history returned for this order.
        </Text>
      ) : null}
      {browsers ? (
        // The browsers the opens came from, in the record's words (lib/record-words.ts browsersLine).
        <Text as="p" variant="bodySm">
          {browsers}
        </Text>
      ) : null}
      <Text as="p" variant="bodySm" tone="subdued">
        A shared device location does not confirm receipt of the parcel.
      </Text>
    </BlockStack>
    </div>
  );
}

/** The open section, as it sits in the accordion: THE OPEN, then EVERY OPEN.
 *  `address`, `rows`, `available` and `capped` override the timeline's (the
 *  Records library opens a record with no timeline: its inspection supplies
 *  them). With no rows from either, the record's own signed opens are listed
 *  in words. */
export default function InkOpens({
  record,
  timeline,
  rows: given,
  available,
  capped,
  address,
  addressLabel = null,
  mapsKey = null,
}: {
  record: RecordRead | null | undefined;
  timeline: OrderTimelineData | null | undefined;
  rows?: EveryOpenRow[];
  available?: boolean;
  capped?: boolean;
  address?: MapPoint | null;
  addressLabel?: string | null;
  mapsKey?: string | null;
}) {
  const rows = given ?? timeline?.rows ?? everyOpenRows(null, record?.opens ?? null);
  const home = address !== undefined ? address : timeline?.address ?? null;
  return (
    <BlockStack gap="500">
      <TheOpen record={record} rows={rows} address={home} addressLabel={addressLabel} mapsKey={mapsKey} />
      <Divider />
      <EveryOpen
        rows={rows}
        address={home}
        mapsKey={mapsKey}
        available={available ?? timeline?.opensAvailable ?? false}
        capped={capped ?? timeline?.opensCapped ?? false}
        browsers={browsersLine(record?.browsers)}
        recorded={opensOf(record)}
      />
    </BlockStack>
  );
}
