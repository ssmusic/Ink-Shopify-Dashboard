// ONE ORDER'S TIMELINE, IN THE ACCORDION — the console's Interaction Timeline
// in Shopify's light look: the lifecycle rail, the opens against the delivery
// address (the map, every located open with its distance, the fix-less opens
// as words), and the delivery window.
//
// Sam, 2026-09-23: "map — and the distance between the delivery address and
// taps within each order along with your delivery information widget".
// The rules are lib/order-timeline.ts's; the map is components/OpensMap.tsx.
// No coordinate is printed as text: the words say the distance and the word.
//
// Every visible string is PLACEHOLDER copy — Sam's words replace it.

import { BlockStack, Box, InlineGrid, InlineStack, Text } from "@shopify/polaris";
import OpensMap, { type MapOpen, type MapPoint } from "./OpensMap";
import { INK_DATA, INK_DATA_TINT, INK_HAIRLINE, INK_MUTED, INK_NEUTRAL } from "../lib/ink-palette";
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
};

const RESULT_WORD: Record<string, string> = {
  within: "within 100 m",
  near: "within 300 m",
  outside: "outside 300 m",
  not_shared: "location not shared",
  unmeasured: "no distance available",
  imprecise: "too wide to measure",
};

// One palette (lib/ink-palette.ts): a located open is the data blue, the rest neutral.
const RESULT_COLOR: Record<string, string> = {
  within: INK_DATA,
  near: INK_DATA,
  outside: INK_DATA,
};

function StepMark({ state }: { state: LifecycleStep["state"] }) {
  const base = { width: 18, height: 18, borderRadius: 9999, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700 } as const;
  if (state === "done") return <span aria-label="done" style={{ ...base, background: INK_NEUTRAL, color: "#fff" }}>✓</span>;
  if (state === "carrier") return <span aria-label="from the carrier" style={{ ...base, background: INK_MUTED, color: "#fff" }}>✓</span>;
  return <span aria-label="not recorded" style={{ ...base, border: `1.5px solid ${INK_HAIRLINE}` }} />;
}

export function LifecycleRail({ steps }: { steps: LifecycleStep[] }) {
  return (
    <InlineGrid columns={{ xs: 2, sm: 4, md: 7 }} gap="200">
      {steps.map((s) => (
        <BlockStack key={s.key} gap="100" inlineAlign="start">
          <StepMark state={s.state} />
          <Text as="p" variant="bodySm" fontWeight="semibold">
            {s.label}
          </Text>
          <Text as="p" variant="bodyXs" tone="subdued">
            {s.at ? when(s.at) : s.note && s.key === "refund_cleared" ? s.note : "not yet"}
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

export function OpensAgainstAddress({ address, opens, mapsKey = null }: { address: MapPoint | null; opens: TimelineOpen[]; mapsKey?: string | null }) {
  const located = opens.filter((o) => o.lat != null && o.lng != null && o.distance_m != null);
  const first = opens.find((o) => o.distance_m != null) ?? opens[0] ?? null;
  const mapOpens: MapOpen[] = located.map((o, i) => ({
    lat: o.lat as number,
    lng: o.lng as number,
    distance_m: o.distance_m,
    label: `Open ${opens.indexOf(o) + 1}${o.at ? ` · ${when(o.at)}` : ""}`,
  }));
  return (
    <BlockStack gap="300">
      <Text as="p" variant="bodySm">
        {first ? openSentence(first.distance_m, first.verdict) : "Not opened yet."}
      </Text>
      {address && mapOpens.length > 0 ? <OpensMap apiKey={mapsKey} address={address} opens={mapOpens} /> : null}
      {opens.length > 0 ? (
        <BlockStack gap="100">
          {opens.map((o, i) => {
            const r = openResult(o.distance_m, o.verdict);
            return (
              <InlineStack key={`${o.at ?? ""}-${i}`} align="space-between" blockAlign="center" gap="200" wrap={false}>
                <InlineStack gap="200" blockAlign="center" wrap={false}>
                  <span aria-hidden style={{ width: 8, height: 8, borderRadius: 9999, background: RESULT_COLOR[r] ?? INK_HAIRLINE, display: "inline-block" }} />
                  <Text as="span" variant="bodySm">
                    {`Open ${i + 1}`}
                  </Text>
                  <Text as="span" variant="bodySm" tone="subdued">
                    {when(o.at)}
                  </Text>
                </InlineStack>
                <Text as="span" variant="bodySm" alignment="end">
                  {o.distance_m != null && (r === "within" || r === "near" || r === "outside") ? `${kmOrM(o.distance_m)} · ${RESULT_WORD[r]}` : RESULT_WORD[r]}
                </Text>
              </InlineStack>
            );
          })}
        </BlockStack>
      ) : null}
      <Text as="p" variant="bodyXs" tone="subdued">
        100 m and 300 m rings — ink.'s default range.
      </Text>
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
        <BlockStack gap="300">
          {section("THE ORDER, STEP BY STEP")}
          <LifecycleRail steps={data.steps} />
        </BlockStack>
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
