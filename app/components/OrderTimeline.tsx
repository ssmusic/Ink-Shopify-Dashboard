// ONE ORDER'S TIMELINE, IN THE ACCORDION — the console's Interaction Timeline
// in Shopify's light look: the lifecycle rail, every open listed beside the
// map of the opens against the delivery address, and the delivery window.
//
// Sam, 2026-09-23: "map — and the distance between the delivery address and
// taps within each order along with your delivery information widget"; then,
// on the first version: "THE ORDER, STEP BY STEP is weird" · "we dont judge"
// · "we dont have a default range" · "this page should be blue highlights like
// the insights page" · "also wanna get the maps blue and the checkmarks blue";
// and, on the next: "you have to list the opens with the map next to it" ·
// "the distance from delivery is just a data point. shouldnt be a giant thing
// taking up the screen". So: no title over the rail, no rings, no within /
// outside, the palette's one blue (lib/ink-palette.ts) for every mark, the
// list beside the map, and each open's distance a word in its row. The rules
// are lib/order-timeline.ts's; the map is components/OpensMap.tsx (Google's).
// No coordinate is printed as text: the words say the distance.
//
// ONE OPEN, PICKED OUT (Sam, 2026-09-23: "can each one of these have a map if
// you click on it also?"). Each open in the list that carried a fix is a
// button: pressing it picks that open out on the map (the others dim and drop
// their labels); pressing it again gives every open back. An open with no fix
// has nothing on the map and stays a line of words.
//
// Every visible string is PLACEHOLDER copy — Sam's words replace it.

import { useState } from "react";
import { BlockStack, Box, InlineGrid, InlineStack, Text } from "@shopify/polaris";
import OpensMap, { type MapOpen, type MapPoint } from "./OpensMap";
import { INK_DATA, INK_DATA_TINT, INK_HAIRLINE, INK_MUTED } from "../lib/ink-palette";
import { kmOrM, openResult, type DeliveryWindow, type LifecycleStep } from "../lib/order-timeline";
import { when } from "../lib/record-words";

export type TimelineOpen = {
  at: string | null;
  verdict: string | null;
  distance_m: number | null;
  accuracy_m: number | null;
  /** For the map only — never printed. */
  lat: number | null;
  lng: number | null;
};

export type OrderTimelineData = {
  steps: LifecycleStep[];
  /** The delivery address's position, for the map only. */
  address: MapPoint | null;
  opens: TimelineOpen[];
  window: DeliveryWindow | null;
  /** The opens door answered: every open is here (else only what the record says). */
  opensAvailable?: boolean;
  /** The opens door limited how many it returned. */
  opensCapped?: boolean;
};

// What an open without a distance says — facts, never a judgment.
const RESULT_WORD: Record<string, string> = {
  shared: "location shared",
  not_shared: "location not shared",
  unmeasured: "no distance available",
  imprecise: "too wide to measure",
};

function StepMark({ state }: { state: LifecycleStep["state"] }) {
  const base = { width: 18, height: 18, borderRadius: 9999, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 } as const;
  if (state === "done") return <span aria-label="done" style={{ ...base, background: INK_DATA, color: "#fff" }}>✓</span>;
  if (state === "carrier") return <span aria-label="from the carrier" style={{ ...base, background: INK_MUTED, color: "#fff" }}>✓</span>;
  return <span aria-label="not recorded" style={{ ...base, border: `1.5px solid ${INK_HAIRLINE}` }} />;
}

/** The rail: Shipped · In transit · Delivered · Opened — no title over it. */
export function LifecycleRail({ steps }: { steps: LifecycleStep[] }) {
  return (
    <InlineGrid columns={{ xs: 2, sm: 4 }} gap="400">
      {steps.map((s) => (
        <BlockStack key={s.key} gap="100" inlineAlign="start">
          <InlineStack gap="150" blockAlign="center" wrap={false}>
            <StepMark state={s.state} />
            <Text as="h4" variant="headingSm">
              {s.label}
            </Text>
          </InlineStack>
          <Text as="p" variant="bodySm" tone={s.at ? undefined : "subdued"}>
            {s.at ? when(s.at) : "Not recorded"}
          </Text>
          {s.state === "carrier" && s.note ? (
            <Text as="p" variant="bodySm" tone="subdued">
              {s.note}
            </Text>
          ) : null}
        </BlockStack>
      ))}
    </InlineGrid>
  );
}

/** The open a press leaves picked out: the pressed one, or none when it was already. */
export function nextFocus(current: number | null, pressed: number): number | null {
  return current === pressed ? null : pressed;
}

// A row of the list: the same geometry pressable or not, so the words line up;
// a pressable row's tint is the palette's, when hovered, pressed or focused.
const ROW_CSS = `.ink-open-row{display:flex;align-items:center;justify-content:space-between;gap:8px;box-sizing:border-box;width:calc(100% + 16px);margin:0 -8px;padding:6px 8px;border:0;border-radius:8px;background:transparent;font:inherit;color:inherit;text-align:left}button.ink-open-row{cursor:pointer}button.ink-open-row:hover{background:var(--p-color-bg-surface-hover)}button.ink-open-row[aria-pressed=true]{background:${INK_DATA_TINT}}button.ink-open-row:focus-visible{outline:2px solid var(--p-color-border-focus);outline-offset:1px}.ink-open-row-lead{display:flex;align-items:center;gap:8px;min-width:0;flex-wrap:wrap}`;

export function OpensAgainstAddress({
  address,
  opens,
  mapsKey = null,
  browsers = null,
  available = true,
  capped = false,
  addressLabel = null,
}: {
  address: MapPoint | null;
  opens: TimelineOpen[];
  /** The Maps JavaScript browser key; none → no map, the words remain. */
  mapsKey?: string | null;
  /** The record's line about the browsers the opens came from. */
  browsers?: string | null;
  /** The opens door answered (false: only the record's first open is known). */
  available?: boolean;
  /** The opens door limited the history it returned. */
  capped?: boolean;
  /** The delivery address in words, from the order. */
  addressLabel?: string | null;
}) {
  const [focus, setFocus] = useState<number | null>(null);
  const located = opens.filter((o) => o.lat != null && o.lng != null && o.distance_m != null);
  const mapOpens: MapOpen[] = located.map((o) => ({
    lat: o.lat as number,
    lng: o.lng as number,
    distance_m: o.distance_m,
    label: `Open ${opens.indexOf(o) + 1}${o.at ? ` · ${when(o.at)}` : ""}`,
  }));
  // Only a drawn map has an open to pick out.
  const mapShown = !!(address && mapOpens.length > 0 && mapsKey);
  return (
    <BlockStack gap="300">
      <Text as="h3" variant="headingMd">
        {available && !capped ? "Every open" : "Open history"}
      </Text>
      {!available ? (
        <Text as="p" tone="subdued">
          The full open history is unavailable. Any details below come from the record.
        </Text>
      ) : null}
      <InlineGrid columns={{ xs: 1, md: 2 }} gap="400" alignItems="start">
        <BlockStack gap="100">
          <style>{ROW_CSS}</style>
          {available && opens.length === 0 ? (
            <Text as="p" tone="subdued">
              No opens recorded.
            </Text>
          ) : null}
          {opens.map((o, i) => {
            const r = openResult(o.distance_m, o.verdict);
            const onMap = mapShown ? located.indexOf(o) : -1;
            const row = (
              <>
                <span className="ink-open-row-lead">
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 9999, background: r === "measured" ? INK_DATA : INK_HAIRLINE, display: "inline-block", flexShrink: 0 }} />
                  <Text as="span" variant="bodySm" fontWeight="semibold">
                    {`Open ${i + 1}`}
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {when(o.at)}
                  </Text>
                  {o.accuracy_m != null ? (
                    <Text as="span" variant="bodySm" tone="subdued">
                      {`± ${kmOrM(o.accuracy_m)}`}
                    </Text>
                  ) : null}
                </span>
                <Text as="span" variant="bodySm" alignment="end">
                  {r === "measured" && o.distance_m != null ? kmOrM(o.distance_m) : RESULT_WORD[r]}
                </Text>
              </>
            );
            const key = `${o.at ?? ""}-${i}`;
            return onMap >= 0 ? (
              <button key={key} type="button" className="ink-open-row" aria-pressed={focus === onMap} onClick={() => setFocus((f) => nextFocus(f, onMap))}>
                {row}
              </button>
            ) : (
              <div key={key} className="ink-open-row">
                {row}
              </div>
            );
          })}
          {capped ? (
            <Box paddingBlockStart="200">
              <Text as="p" tone="subdued">
                The merchant service limited the open history returned for this order.
              </Text>
            </Box>
          ) : null}
          {browsers ? (
            // The browsers the opens came from, in the record's words (lib/record-words.ts browsersLine).
            <Box paddingBlockStart="200">
              <Text as="p" variant="bodySm">
                {browsers}
              </Text>
            </Box>
          ) : null}
        </BlockStack>
        <BlockStack gap="200">
          <Text as="h4" variant="headingSm">
            Delivery address
          </Text>
          <Text as="p" breakWord>
            {addressLabel || "Address unavailable"}
          </Text>
          {mapShown ? <OpensMap apiKey={mapsKey} address={address} opens={mapOpens} focus={focus} /> : null}
          <Text as="p" variant="bodySm" tone="subdued">
            A shared device location does not confirm receipt of the parcel.
          </Text>
        </BlockStack>
      </InlineGrid>
    </BlockStack>
  );
}

/** The delivery window: the delivered scan, the first open where it fell, and
 *  the end of the recording window the backend set — facts, never a verdict. */
export function DeliveryWindowBar({ w }: { w: DeliveryWindow | null }) {
  if (!w) {
    return (
      <Text as="p" variant="bodySm" tone="subdued">
        The window opens when the carrier says delivered.
      </Text>
    );
  }
  const relative =
    w.hoursToOpen == null
      ? null
      : `${Math.abs(w.hoursToOpen) < 1 ? `${Math.round(Math.abs(w.hoursToOpen) * 60)} minutes` : `${Math.round(Math.abs(w.hoursToOpen) * 10) / 10} hours`} ${w.hoursToOpen < 0 ? "before" : "after"} delivery`;
  return (
    <BlockStack gap="300">
      <Text as="h3" variant="headingMd">
        Delivery and first open
      </Text>
      <div style={{ position: "relative", height: 28, borderRadius: 6, background: INK_DATA_TINT, border: "1px solid var(--p-color-border)" }}>
        {w.openPositionPct != null ? (
          <div aria-label="first open" style={{ position: "absolute", top: 0, bottom: 0, left: `${w.openPositionPct}%`, width: 2, background: INK_DATA }}>
            <span style={{ position: "absolute", top: -4, left: -3, width: 8, height: 8, borderRadius: 9999, background: INK_DATA }} />
          </div>
        ) : null}
      </div>
      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
        <BlockStack gap="050">
          <Text as="span" variant="bodySm" tone="subdued">Delivered</Text>
          <Text as="span" variant="bodySm">{when(w.deliveredAt)}</Text>
        </BlockStack>
        <BlockStack gap="050">
          <Text as="span" variant="bodySm" tone="subdued">First open</Text>
          <Text as="span" variant="bodySm">{w.firstOpenAt ? when(w.firstOpenAt) : "No open recorded"}</Text>
          {relative ? <Text as="span" variant="bodySm" tone="subdued">{relative}</Text> : null}
        </BlockStack>
        <BlockStack gap="050">
          <Text as="span" variant="bodySm" tone="subdued">Recording window ends</Text>
          <Text as="span" variant="bodySm">{when(w.windowEnd)}</Text>
        </BlockStack>
      </InlineGrid>
    </BlockStack>
  );
}

/** The whole block, as it sits in the accordion: the rail, every open beside
 *  the map, and the delivery window. `mapsKey` is the referrer-restricted
 *  Google Maps browser key (no key, no map). `browsers` is the record's line
 *  about the browsers the opens came from, printed under the opens. */
export default function OrderTimeline({
  data,
  mapsKey = null,
  browsers = null,
  addressLabel = null,
}: {
  data: OrderTimelineData;
  mapsKey?: string | null;
  browsers?: string | null;
  addressLabel?: string | null;
}) {
  return (
    <BlockStack gap="500">
      <LifecycleRail steps={data.steps} />
      <OpensAgainstAddress
        address={data.address}
        opens={data.opens}
        mapsKey={mapsKey}
        browsers={browsers}
        available={data.opensAvailable ?? true}
        capped={data.opensCapped ?? false}
        addressLabel={addressLabel}
      />
      <DeliveryWindowBar w={data.window} />
    </BlockStack>
  );
}
