import {
  Badge,
  BlockStack,
  Divider,
  InlineGrid,
  InlineStack,
  Text,
} from "@shopify/polaris";
import {
  LEVEL_WORDS,
  elementLines,
  type RecordRead,
} from "../lib/record-words";

export type WordLine = { label: string; words: string };

export function RecordWords({
  record,
  evidenceIds,
  checkout = null,
}: {
  record: RecordRead | null;
  evidenceIds?: Record<string, string[]>;
  /** The checkout beside the opens, already in words (#134): after the elements. */
  checkout?: WordLine[] | null;
}) {
  if (!record)
    return (
      <Text as="p" tone="subdued">
        Record details are unavailable. Refresh to try again.
      </Text>
    );
  return (
    <BlockStack gap="300">
      <Text as="h3" variant="headingMd">
        What this record contains
      </Text>
      <Text as="p" tone="subdued">
        Evidence levels reported by the record.
      </Text>
      {record.elements.map((el) => (
        <BlockStack key={el.element} gap="200">
          <Divider />
          <InlineStack align="space-between" gap="200">
            <Text as="h4" variant="headingSm">
              {el.label}
            </Text>
            <Badge>{LEVEL_WORDS[el.status] || "Unknown"}</Badge>
          </InlineStack>
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="100">
            {elementLines(el).map((line, i) => (
              <InlineStack key={i} gap="200" blockAlign="baseline">
                <Text as="span" tone="subdued">
                  {line.label}
                </Text>
                <Text as="span" breakWord>
                  {line.words}
                </Text>
              </InlineStack>
            ))}
            {!elementLines(el).length && (
              <Text as="p" tone="subdued">
                Not recorded
              </Text>
            )}
          </InlineGrid>
          {evidenceIds?.[el.element] && (
            <Text as="p" variant="bodySm" tone="subdued" breakWord>
              {evidenceIds[el.element].length
                ? `Evidence: ${evidenceIds[el.element].join(", ")}`
                : "No evidence event supplied"}
            </Text>
          )}
        </BlockStack>
      ))}
      {checkout && checkout.length ? (
        <BlockStack gap="200">
          <Divider />
          <InlineGrid columns={{ xs: 1, sm: 2 }} gap="100">
            {checkout.map((line, i) => (
              <InlineStack key={i} gap="200" blockAlign="baseline">
                <Text as="span" tone="subdued">
                  {line.label}
                </Text>
                <Text as="span" breakWord>
                  {line.words}
                </Text>
              </InlineStack>
            ))}
          </InlineGrid>
        </BlockStack>
      ) : null}
    </BlockStack>
  );
}
