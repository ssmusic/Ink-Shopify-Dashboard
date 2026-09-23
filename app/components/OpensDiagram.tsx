// Codex's opens diagram (4022900, its components/OpensMap.tsx), as Sam saw it
// on 2026-09-23. Kept apart from Google's map (components/OpensMap.tsx), which
// the THE OPEN port builds on.
import { BlockStack, Box, Text } from "@shopify/polaris";
import { kmOrM } from "../lib/order-timeline";
export type MapPoint = { lat: number; lng: number };
export type MapOpen = MapPoint & {
  label: string;
  distance_m: number | null;
  verdict?: string | null;
};

/** A geographic distance diagram. Rings are metre guides, never verdicts.
 * No map tile provider receives a customer's position. */
export default function OpensDiagram({
  address,
  opens,
}: {
  address: MapPoint;
  opens: MapOpen[];
}) {
  const point = opens[0];
  if (!point) return null;
  const east =
    (point.lng - address.lng) * Math.cos((address.lat * Math.PI) / 180);
  const north = point.lat - address.lat;
  const norm = Math.hypot(east, north) || 1;
  const distance = point.distance_m;
  const outsideView = distance != null && distance > 300;
  const radius = distance == null ? 0 : outsideView ? 72 : distance * 0.16;
  const x = 160 + (east / norm) * radius;
  const y = 80 - (north / norm) * radius;
  return (
    <BlockStack gap="300">
      <Box
        background="bg-surface"
        borderRadius="200"
        padding="200"
        maxWidth="300px"
      >
        <svg
          viewBox="0 0 320 190"
          width="100%"
          role="img"
          aria-label={`Delivery address and ${point.label}. ${distance == null ? "Distance unavailable." : `${kmOrM(distance)} apart.`}`}
          data-testid="opens-map"
          data-points={opens.length}
        >
          <circle
            cx="160"
            cy="80"
            r="48"
            fill="var(--p-color-bg-fill-info-secondary)"
            stroke="var(--p-color-border-info)"
          />
          <circle
            cx="160"
            cy="80"
            r="16"
            fill="none"
            stroke="var(--p-color-border-info)"
          />
          <text
            x="160"
            y="21"
            textAnchor="middle"
            fontSize="14"
            fill="var(--p-color-text-info)"
          >
            300 m
          </text>
          <text x="182" y="76" fontSize="13" fill="var(--p-color-text-info)">
            100 m
          </text>
          <line
            x1="160"
            y1="80"
            x2={x}
            y2={y}
            stroke="var(--p-color-border-info)"
            strokeWidth="2"
          />
          <circle cx="160" cy="80" r="6" fill="var(--p-color-text)" />
          <circle
            cx={x}
            cy={y}
            r="7"
            fill="var(--p-color-text-info)"
            stroke="var(--p-color-bg-surface)"
            strokeWidth="2"
          />
          <text
            x="160"
            y="170"
            textAnchor="middle"
            fontSize="12"
            fill="var(--p-color-text)"
          >
            Delivery address
          </text>
        </svg>
      </Box>
      <Text as="p" tone="subdued" variant="bodySm">
        100 m and 300 m distance guides.
      </Text>
      {outsideView && (
        <Text as="p" tone="subdued" variant="bodySm">
          Direction only beyond the 300 m guide.
        </Text>
      )}
    </BlockStack>
  );
}
