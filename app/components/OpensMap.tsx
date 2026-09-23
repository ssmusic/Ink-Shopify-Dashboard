import { useState } from "react";
import { BlockStack, Box, Select, Text } from "@shopify/polaris";
import { kmOrM } from "../lib/order-timeline";
export type MapPoint = { lat: number; lng: number };
export type MapOpen = MapPoint & {
  label: string;
  distance_m: number | null;
  verdict?: string | null;
};

/** A geographic distance diagram. Rings are metre guides, never verdicts.
 * No map tile provider receives a customer's position. */
export default function OpensMap({
  address,
  opens,
}: {
  address: MapPoint;
  opens: MapOpen[];
}) {
  const [selected, setSelected] = useState("0");
  const point = opens[Number(selected)] || opens[0];
  if (!point) return null;
  const east =
    (point.lng - address.lng) * Math.cos((address.lat * Math.PI) / 180);
  const north = point.lat - address.lat;
  const norm = Math.hypot(east, north) || 1;
  const distance = point.distance_m;
  const outsideView = distance != null && distance > 360;
  const radius = distance == null ? 0 : Math.min(108, distance * 0.3);
  const x = 160 + (east / norm) * radius;
  const y = 128 - (north / norm) * radius;
  return (
    <BlockStack gap="300">
      {opens.length > 1 && (
        <Select
          label="Open on the diagram"
          options={opens.map((p, i) => ({ label: p.label, value: String(i) }))}
          value={selected}
          onChange={setSelected}
        />
      )}
      <Box
        background="bg-surface"
        borderColor="border"
        borderWidth="025"
        borderRadius="200"
        padding="200"
      >
        <svg
          viewBox="0 0 320 256"
          width="100%"
          role="img"
          aria-label={`Delivery address and ${point.label}. ${distance == null ? "Distance unavailable." : `${kmOrM(distance)} apart.`}`}
          data-testid="opens-map"
          data-points={opens.length}
        >
          <circle
            cx="160"
            cy="128"
            r="90"
            fill="var(--p-color-bg-fill-info-secondary)"
            stroke="var(--p-color-border-info)"
          />
          <circle
            cx="160"
            cy="128"
            r="30"
            fill="none"
            stroke="var(--p-color-border-info)"
          />
          <text
            x="160"
            y="27"
            textAnchor="middle"
            fontSize="14"
            fill="var(--p-color-text-info)"
          >
            300 m
          </text>
          <text x="198" y="124" fontSize="14" fill="var(--p-color-text-info)">
            100 m
          </text>
          <line
            x1="160"
            y1="128"
            x2={x}
            y2={y}
            stroke="var(--p-color-border-info)"
            strokeWidth="2"
          />
          <circle cx="160" cy="128" r="7" fill="var(--p-color-text)" />
          <circle
            cx={x}
            cy={y}
            r="8"
            fill="var(--p-color-text-info)"
            stroke="var(--p-color-bg-surface)"
            strokeWidth="2"
          />
          <text
            x="160"
            y="243"
            textAnchor="middle"
            fontSize="14"
            fill="var(--p-color-text)"
          >
            Delivery address at centre
          </text>
        </svg>
      </Box>
      <Text as="p" fontWeight="semibold">
        {point.label}
        {distance == null
          ? ""
          : ` · ${kmOrM(distance)} from the delivery address`}
      </Text>
      {outsideView && (
        <Text as="p" tone="subdued">
          This location is beyond the diagram. The marker shows its direction.
        </Text>
      )}
    </BlockStack>
  );
}
