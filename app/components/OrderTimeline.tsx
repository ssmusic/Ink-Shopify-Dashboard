// ONE ORDER'S TIMELINE, IN THE ACCORDION — the console's Interaction Timeline
// in Shopify's light look: the lifecycle rail, the opens against the delivery
// address (the map, every located open with its distance, the fix-less opens
// as words), and the delivery window.
//
// Sam, 2026-09-23: "map — and the distance between the delivery address and
// taps within each order along with your delivery information widget"; then,
// on the first version: "THE ORDER, STEP BY STEP is weird" · "we dont judge"
// · "we dont have a default range" · "this page should be blue highlights like
// the insights page". So: no title over the rail, no rings, no within /
// outside, and the palette's one blue (lib/ink-palette.ts) for every mark.
// The rules are lib/order-timeline.ts's; the map is components/OpensMap.tsx.
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
import { kmOrM, openResult, openSentence, type DeliveryWindow, type LifecycleStep } from "../lib/order-timeline";
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
  /** Where the opens came from: the opens door, or the proof alone (its first
   *  open, whose words the record then supplies — services/ink-timeline.server.ts). */
  opensFrom?: "opens" | "proof";
};

// What an open without a distance says — facts, never a judgment.
const RESULT_WORD: Record<string, string> = {
  shared: "location shared",
  not_shared: "location not shared",
  unmeasured: "no distance available",
  imprecise: "too wide to measure",
};

function StepMark({ state }: { state: LifecycleStep["state"] }) {
  const base = { width: 18, height: 18, borderRadius: 9999, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 } as const;
  if (state === "done") return <span aria-label="done" style={{ ...base, background: INK_DATA, color: "#fff" }}>✓</span>;
  if (state === "carrier") return <span aria-label="from the carrier" style={{ ...base, background: INK_MUTED, color: "#fff" }}>✓</span>;
  return <span aria-label="not recorded" style={{ ...base, border: `1.5px solid ${INK_HAIRLINE}` }} />;
}

export function LifecycleRail({ steps }: { steps: LifecycleStep[] }) {
  return (
    <InlineGrid columns={{ xs: 2, sm: 4 }} gap="200">
      {steps.map((s) => (
        <BlockStack key={s.key} gap="100" inlineAlign="start">
          <StepMark state={s.state} />
          <Text as="p" variant="bodySm" fontWeight="semibold">
            {s.label}
          </Text>
          <Text as="p" variant="bodyXs" tone="subdued">
            {s.at ? when(s.at) : "not yet"}
          </Text>
          {s.state === "carrier" ? (
            <Text as="p" variant="bodyXs" tone="subdued">
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
const ROW_CSS = `.ink-open-row{display:flex;align-items:center;justify-content:space-between;gap:8px;box-sizing:border-box;width:calc(100% + 16px);margin:0 -8px;padding:4px 8px;border:0;border-radius:8px;background:transparent;font:inherit;color:inherit;text-align:left}button.ink-open-row{cursor:pointer}button.ink-open-row:hover{background:var(--p-color-bg-surface-hover)}button.ink-open-row[aria-pressed=true]{background:${INK_DATA_TINT}}button.ink-open-row:focus-visible{outline:2px solid var(--p-color-border-focus);outline-offset:1px}.ink-open-row-lead{display:flex;align-items:center;gap:8px;min-width:0}`;

export function OpensAgainstAddress({ address, opens, mapsKey = null }: { address: MapPoint | null; opens: TimelineOpen[]; mapsKey?: string | null }) {
  const [focus, setFocus] = useState<number | null>(null);
  const located = opens.filter((o) => o.lat != null && o.lng != null && o.distance_m != null);
  const first = opens.find((o) => o.distance_m != null) ?? opens[0] ?? null;
  const mapOpens: MapOpen[] = located.map((o, i) => ({
    lat: o.lat as number,
    lng: o.lng as number,
    distance_m: o.distance_m,
    label: `Open ${opens.indexOf(o) + 1}${o.at ? ` · ${when(o.at)}` : ""}`,
  }));
  // Only a drawn map has an open to pick out.
  const mapShown = !!(address && mapOpens.length > 0 && mapsKey);
  return (
    <BlockStack gap="300">
      <Text as="p" variant="bodySm">
        {first ? openSentence(first.distance_m, first.verdict) : "Not opened yet."}
      </Text>
      {mapShown ? <OpensMap apiKey={mapsKey} address={address} opens={mapOpens} focus={focus} /> : null}
      {opens.length > 0 ? (
        <BlockStack gap="100">
          <style>{ROW_CSS}</style>
          {opens.map((o, i) => {
            const r = openResult(o.distance_m, o.verdict);
            const onMap = mapShown ? located.indexOf(o) : -1;
            const row = (
              <>
                <span className="ink-open-row-lead">
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 9999, background: r === "measured" ? INK_DATA : INK_HAIRLINE, display: "inline-block", flexShrink: 0 }} />
                  <Text as="span" variant="bodySm">
                    {`Open ${i + 1}`}
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {when(o.at)}
                  </Text>
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
        </BlockStack>
      ) : null}
    </BlockStack>
  );
}

export function DeliveryWindowBar({ w }: { w: DeliveryWindow | null }) {
  if (!w) {
    return (
      <Text as="p" variant="bodySm" tone="subdued">
        The window opens when the carrier says delivered.
      </Text>
    );
  }
  return (
    <BlockStack gap="200">
      <div style={{ position: "relative", height: 28, borderRadius: 6, background: INK_DATA_TINT, border: "1px solid var(--p-color-border)" }}>
        {w.openPositionPct != null ? (
          <div aria-label="first open" style={{ position: "absolute", top: 0, bottom: 0, left: `${w.openPositionPct}%`, width: 2, background: INK_DATA }}>
            <span style={{ position: "absolute", top: -4, left: -3, width: 8, height: 8, borderRadius: 9999, background: INK_DATA }} />
          </div>
        ) : null}
      </div>
      <InlineStack align="space-between">
        <Text as="span" variant="bodyXs" tone="subdued">{`Delivered · ${when(w.deliveredAt)}`}</Text>
        <Text as="span" variant="bodyXs" tone="subdued">{`Window closes · ${when(w.windowEnd)}`}</Text>
      </InlineStack>
      <InlineGrid columns={3} gap="200">
        <BlockStack gap="050">
          <Text as="span" variant="bodyXs" tone="subdued">First open</Text>
          <Text as="span" variant="bodySm">{w.firstOpenAt ? when(w.firstOpenAt) : "No open yet"}</Text>
        </BlockStack>
        <BlockStack gap="050">
          <Text as="span" variant="bodyXs" tone="subdued">Time to first open</Text>
          <Text as="span" variant="bodySm">{w.hoursToOpen == null ? "—" : w.hoursToOpen < 0 ? `${Math.abs(w.hoursToOpen)} h before delivery` : `${w.hoursToOpen} h after delivery`}</Text>
        </BlockStack>
        <BlockStack gap="050">
          <Text as="span" variant="bodyXs" tone="subdued">Within the expected window</Text>
          <Text as="span" variant="bodySm">{w.withinExpectedWindow == null ? "—" : w.withinExpectedWindow ? "Yes" : "No"}</Text>
        </BlockStack>
      </InlineGrid>
    </BlockStack>
  );
}

/** The whole block, as it sits in the accordion under the record's words. */
export default function OrderTimeline({ data, mapsKey = null }: { data: OrderTimelineData; mapsKey?: string | null }) {
  const section = (title: string) => (
    <Text as="p" variant="bodySm" fontWeight="semibold" tone="subdued">
      {title}
    </Text>
  );
  return (
    <Box padding="400">
      <BlockStack gap="500">
        <LifecycleRail steps={data.steps} />
        <InlineGrid columns={{ xs: 1, md: 2 }} gap="500">
          <BlockStack gap="300">
            {section("THE OPENS · THE CUSTOMER'S PHONE ↔ THE DELIVERY ADDRESS")}
            <OpensAgainstAddress address={data.address} opens={data.opens} mapsKey={mapsKey} />
          </BlockStack>
          <BlockStack gap="300">
            {section("THE DELIVERY WINDOW")}
            <DeliveryWindowBar w={data.window} />
          </BlockStack>
        </InlineGrid>
      </BlockStack>
    </Box>
  );
}
