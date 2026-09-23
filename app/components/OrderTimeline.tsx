import {
  Icon,
  BlockStack,
  Box,
  Divider,
  InlineGrid,
  InlineStack,
  Text,
} from "@shopify/polaris";
import { CheckCircleIcon } from "@shopify/polaris-icons";
import OpensMap, { type MapOpen, type MapPoint } from "./OpensMap";
import {
  kmOrM,
  openSentence,
  type DeliveryWindow,
  type LifecycleStep,
} from "../lib/order-timeline";
import { when } from "../lib/record-words";
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
            <InlineStack align="start" blockAlign="center" gap="100">
              {s.at && (
                <Box maxWidth="20px">
                  <Icon source={CheckCircleIcon} tone="info" />
                </Box>
              )}
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
  const mapOpens: MapOpen[] = opens.flatMap((o, i) =>
    o.lat != null &&
    o.lng != null &&
    o.distance_m != null &&
    !["not_shared", "imprecise", "unmeasured"].includes(o.verdict || "")
      ? [
          {
            lat: o.lat,
            lng: o.lng,
            distance_m: o.distance_m,
            label: `Open ${i + 1}`,
          },
        ]
      : [],
  );
  return (
    <BlockStack gap="300">
      <Text as="h4" variant="headingSm">
        Delivery address
      </Text>
      <Text as="p" breakWord>
        {addressLabel}
      </Text>
      <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
        <BlockStack gap="300">
          {address && mapOpens.length > 0 ? (
            <OpensMap address={address} opens={mapOpens} />
          ) : (
            <Text as="p" tone="subdued">
              A distance diagram is unavailable for these opens.
            </Text>
          )}
        </BlockStack>
        <Box
          background="bg-surface"
          borderColor="border"
          borderWidth="025"
          borderRadius="200"
          padding="300"
        >
          <BlockStack gap="300">
            <Text as="h4" variant="headingSm">
              {available && !capped ? "Every open" : "Open history"}
            </Text>
            {!available && (
              <Text as="p" tone="subdued">
                The full open history is unavailable. Any details below come
                from the record.
              </Text>
            )}
            {available && !opens.length && (
              <Text as="p" tone="subdued">
                No opens recorded.
              </Text>
            )}
            {opens.map((o, i) => (
              <BlockStack key={`${o.at}-${i}`} gap="100">
                {i > 0 && <Divider />}
                <InlineStack align="space-between" gap="200">
                  <Box color="text-info">
                    <Text as="p" fontWeight="semibold">{`Open ${i + 1}`}</Text>
                  </Box>
                  <Text as="p">{when(o.at)}</Text>
                </InlineStack>
                <Text as="p">{openSentence(o.distance_m, o.verdict)}</Text>
                {o.accuracy_m != null && (
                  <Text
                    as="p"
                    tone="subdued"
                    variant="bodySm"
                  >{`Location accuracy ${kmOrM(o.accuracy_m)}`}</Text>
                )}
              </BlockStack>
            ))}
            {capped && (
              <Text as="p" tone="subdued">
                The merchant service limited the open history returned for this
                order.
              </Text>
            )}
          </BlockStack>
        </Box>
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
      <Text as="p">{`Delivered ${when(w.deliveredAt)}`}</Text>
      <Text as="p">{`Recording window ends ${when(w.windowEnd)}`}</Text>
      <Divider />
      <Text as="p">
        {w.firstOpenAt
          ? `First open ${when(w.firstOpenAt)}`
          : "No open recorded."}
      </Text>
      {w.hoursToOpen != null && (
        <Text as="p">{`${Math.abs(w.hoursToOpen) < 1 ? `${Math.round(Math.abs(w.hoursToOpen) * 60)} minutes` : `${Math.round(Math.abs(w.hoursToOpen) * 10) / 10} hours`} ${w.hoursToOpen < 0 ? "before" : "after"} delivery`}</Text>
      )}
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
        <Text as="h3" variant="headingMd">
          Delivery and first open
        </Text>
        <DeliveryWindowBar w={data.window} />
      </BlockStack>
      <BlockStack gap="300">
        <Text as="h3" variant="headingMd">
          Opens and location
        </Text>
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
