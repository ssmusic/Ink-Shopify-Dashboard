import { useState } from "react";
import {
  Button,
  BlockStack,
  Box,
  Divider,
  InlineGrid,
  InlineStack,
  Text,
} from "@shopify/polaris";
import OpensMap, { type MapOpen, type MapPoint } from "./OpensDiagram";
import {
  kmOrM,
  openSentence,
  type DeliveryWindow,
  type LifecycleStep,
} from "../lib/order-timeline";
import { when } from "../lib/record-words";
import { INK_DATA, INK_HAIRLINE, INK_MUTED } from "../lib/ink-palette";
export type TimelineOpen = {
  at: string | null;
  verdict: string | null;
  distance_m: number | null;
  accuracy_m: number | null;
  lat: number | null;
  lng: number | null;
};
export type OrderTimelineData = {
  steps: LifecycleStep[];
  address: MapPoint | null;
  opens: TimelineOpen[];
  window: DeliveryWindow | null;
  opensAvailable?: boolean;
  opensCapped?: boolean;
};
export function LifecycleRail({ steps }: { steps: LifecycleStep[] }) {
  return (
    <InlineGrid columns={{ xs: 1, sm: 2, md: 5 }} gap="400">
      {steps
        .filter(
          (s) => !["return_started", "refund_cleared"].includes(s.key) || s.at,
        )
        .map((s) => (
          <BlockStack key={s.key} gap="100">
            <InlineStack align="start" blockAlign="center" gap="150" wrap={false}>
              <StepMark state={s.at ? s.state : "not_recorded"} />
              <Text as="h4" variant="headingSm">
                {s.label}
              </Text>
            </InlineStack>
            <Text as="p" variant="bodySm" tone={s.at ? undefined : "subdued"}>
              {s.at ? when(s.at) : "Not recorded"}
            </Text>
            {s.state === "carrier" && s.at && (
              <Text as="p" tone="subdued" variant="bodySm">
                Carrier scan
              </Text>
            )}
          </BlockStack>
        ))}
    </InlineGrid>
  );
}

// A step's mark: the one blue when it is recorded, the carrier's grey when only
// the carrier said so, an empty ring when nothing was recorded — every label
// starts on the same line (lib/ink-palette.ts).
function StepMark({ state }: { state: LifecycleStep["state"] }) {
  const base = { width: 18, height: 18, borderRadius: 9999, display: "inline-flex", alignItems: "center", justifyContent: "center", fontSize: 11, fontWeight: 700, flexShrink: 0 } as const;
  if (state === "done") return <span aria-label="Recorded" style={{ ...base, background: INK_DATA, color: "#fff" }}>✓</span>;
  if (state === "carrier") return <span aria-label="Carrier scan" style={{ ...base, background: INK_MUTED, color: "#fff" }}>✓</span>;
  return <span aria-label="Not recorded" style={{ ...base, border: `1.5px solid ${INK_HAIRLINE}` }} />;
}
export function OpensAgainstAddress({
  address,
  opens,
  available = true,
  capped = false,
  addressLabel = "Address unavailable",
}: {
  address: MapPoint | null;
  opens: TimelineOpen[];
  available?: boolean;
  capped?: boolean;
  addressLabel?: string;
}) {
  const [selected, setSelected] = useState(0);
  const selectedOpen = opens[selected];
  const hasPoint = (o: TimelineOpen) =>
    o.lat != null &&
    o.lng != null &&
    o.distance_m != null &&
    !["not_shared", "imprecise", "unmeasured"].includes(o.verdict || "");
  const mapOpens: MapOpen[] =
    selectedOpen && hasPoint(selectedOpen)
      ? [
          {
            lat: selectedOpen.lat!,
            lng: selectedOpen.lng!,
            distance_m: selectedOpen.distance_m,
            label: `Open ${selected + 1}`,
          },
        ]
      : [];
  return (
    <BlockStack gap="300">
      <Text as="h3" variant="headingMd">
        {available && !capped ? "Every open" : "Open history"}
      </Text>
      {!available && (
        <Text as="p" tone="subdued">
          The full open history is unavailable. Any details below come from the
          record.
        </Text>
      )}
      <InlineGrid
        columns={{ xs: 1, md: ["twoThirds", "oneThird"] }}
        gap="400"
        alignItems="start"
      >
        <BlockStack gap="0">
          {available && !opens.length && (
            <Text as="p" tone="subdued">
              No opens recorded.
            </Text>
          )}
          {opens.map((o, i) => (
            <Box
              key={`${o.at}-${i}`}
              padding="300"
              background={i === selected ? "bg-surface-info" : undefined}
              borderBlockEndWidth="025"
              borderColor="border"
            >
              <InlineGrid columns={{ xs: 1, sm: 2 }} gap="100">
                <BlockStack gap="100">
                  <Button
                    variant="plain"
                    textAlign="left"
                    pressed={i === selected}
                    onClick={() => setSelected(i)}
                    accessibilityLabel={`Show open ${i + 1} location`}
                  >
                    {`Open ${i + 1}`}
                  </Button>
                  <Text as="p" variant="bodySm">
                    {when(o.at)}
                  </Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="p">{openSentence(o.distance_m, o.verdict)}</Text>
                  {o.accuracy_m != null && (
                    <Text
                      as="p"
                      tone="subdued"
                      variant="bodySm"
                    >{`Location accuracy ${kmOrM(o.accuracy_m)}`}</Text>
                  )}
                </BlockStack>
              </InlineGrid>
            </Box>
          ))}
          {capped && (
            <Box paddingBlockStart="200">
              <Text as="p" tone="subdued">
                The merchant service limited the open history returned for this
                order.
              </Text>
            </Box>
          )}
        </BlockStack>
        <BlockStack gap="200">
          <Text as="h4" variant="headingSm">
            Delivery address
          </Text>
          <Text as="p" breakWord>
            {addressLabel}
          </Text>
          <Box
            background="bg-surface-secondary"
            borderRadius="200"
            padding="200"
          >
            {address && mapOpens.length ? (
              <OpensMap address={address} opens={mapOpens} />
            ) : (
              <Box padding="300">
                <Text as="p" tone="subdued">
                  {selectedOpen?.verdict === "not_shared"
                    ? `Open ${selected + 1}: location not shared.`
                    : "A location diagram is unavailable for this open."}
                </Text>
              </Box>
            )}
          </Box>
          {mapOpens[0] && (
            <Text
              as="p"
              variant="bodySm"
              tone="subdued"
            >{`Open ${selected + 1}: ${mapOpens[0].lat.toFixed(4)}, ${mapOpens[0].lng.toFixed(4)}`}</Text>
          )}
          <Text as="p" variant="bodySm" tone="subdued">
            A shared device location does not confirm receipt of the parcel.
          </Text>
        </BlockStack>
      </InlineGrid>
    </BlockStack>
  );
}
export function DeliveryWindowBar({ w }: { w: DeliveryWindow | null }) {
  if (!w)
    return (
      <Text as="p" tone="subdued">
        Delivery window unavailable.
      </Text>
    );
  return (
    <BlockStack gap="300">
      <Text as="h3" variant="headingMd">
        Delivery and first open
      </Text>
      <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
        <BlockStack gap="100">
          <Text as="p" tone="subdued">
            Delivered
          </Text>
          <Text as="p">{when(w.deliveredAt)}</Text>
        </BlockStack>
        <BlockStack gap="100">
          <Text as="p" tone="subdued">
            First open
          </Text>
          <Text as="p">
            {w.firstOpenAt ? when(w.firstOpenAt) : "No open recorded"}
          </Text>
          {w.hoursToOpen != null && (
            <Text
              as="p"
              variant="bodySm"
              tone="subdued"
            >{`${Math.abs(w.hoursToOpen) < 1 ? `${Math.round(Math.abs(w.hoursToOpen) * 60)} minutes` : `${Math.round(Math.abs(w.hoursToOpen) * 10) / 10} hours`} ${w.hoursToOpen < 0 ? "before" : "after"} delivery`}</Text>
          )}
        </BlockStack>
        <BlockStack gap="100">
          <Text as="p" tone="subdued">
            Recording window ends
          </Text>
          <Text as="p">{when(w.windowEnd)}</Text>
        </BlockStack>
      </InlineGrid>
    </BlockStack>
  );
}

export default function OrderTimeline({
  data,
  addressLabel,
}: {
  data: OrderTimelineData;
  addressLabel?: string;
}) {
  return (
    <BlockStack gap="500">
      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          Order activity
        </Text>
        <LifecycleRail steps={data.steps} />
      </BlockStack>
      <BlockStack gap="300">
        <DeliveryWindowBar w={data.window} />
      </BlockStack>
      <BlockStack gap="300">
        <OpensAgainstAddress
          address={data.address}
          opens={data.opens}
          available={data.opensAvailable}
          capped={data.opensCapped}
          addressLabel={addressLabel}
        />
      </BlockStack>
    </BlockStack>
  );
}
