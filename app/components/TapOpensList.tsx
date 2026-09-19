import { BlockStack, InlineStack, Text } from "@shopify/polaris";
import type { OpenRow } from "../services/order-open-record";

// Every open of the order, newest first — the same dot-and-two-lines row the
// Open tab's timeline already uses. Each row says when, what the customer
// shared about where, and the device in a word. Coordinates never render.
export default function TapOpensList({ opens }: { opens: OpenRow[] }) {
  const fmt = (iso: string | null) =>
    iso
      ? new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })
      : "—";
  return (
    <BlockStack gap="400">
      <Text as="p" tone="subdued" variant="bodySm" fontWeight="medium">
        Opens · {opens.length}
      </Text>
      <BlockStack gap="300">
        {opens.map((o, i) => (
          <InlineStack key={o.tap_id || `${o.tap_at ?? "open"}-${i}`} gap="300" blockAlign="start">
            <div
              style={{
                width: "10px",
                height: "10px",
                borderRadius: "50%",
                background: o.first ? "var(--p-color-text)" : "var(--p-color-border)",
                marginTop: "4px",
                flexShrink: 0,
              }}
            />
            <BlockStack gap="100">
              <Text as="p" variant="bodySm" fontWeight="medium">
                {fmt(o.tap_at)}
                {o.device ? ` · ${o.device}` : ""}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {o.location}
              </Text>
            </BlockStack>
          </InlineStack>
        ))}
      </BlockStack>
    </BlockStack>
  );
}
