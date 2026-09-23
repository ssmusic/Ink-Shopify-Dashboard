// THE RECORD, IN WORDS — what an order's record says, inside the accordion.
//
// Sam, 2026-09-23: "we need to be showing the record" · "merchants need to see
// lots of compelling data — the 29 gets it signed — they need to build their
// case with and decide if our data is helping — so they need to see it" ·
// "they need to see all the info but not get the signed hash". So every order
// shows, free: each element with its level and values (lib/record-words.ts,
// the public record page's own words), the checkout beside the opens when the
// backend's words carry it (handed in, already in words, by
// components/InkRecentOrders.tsx — the one file that reads them), the
// checks against the published key, and every signed event — each in words.
// Never a coordinate, a hash or a signed byte: those are the hand-over's
// (lib/record-handover.ts), shown once it is bought (components/InkRecordInspection.tsx).
//
// Every visible string is PLACEHOLDER copy — Sam's words replace it.

import { Badge, BlockStack, Box, Divider, InlineGrid, InlineStack, Text } from "@shopify/polaris";
import { LEVEL_WORDS, elementLines, when, type RecordChecks, type RecordEvent, type RecordRead } from "../lib/record-words";

export type WordLine = { label: string; words: string };

function Lines({ lines }: { lines: WordLine[] }) {
  return (
    <InlineGrid columns={{ xs: 1, sm: 2 }} gap="100">
      {lines.map((line, i) => (
        <InlineStack key={`${line.label}-${i}`} gap="200" blockAlign="baseline" wrap={false}>
          <Text as="span" tone="subdued">
            {line.label}
          </Text>
          <Text as="span" breakWord>
            {line.words}
          </Text>
        </InlineStack>
      ))}
    </InlineGrid>
  );
}

/** Each element with its level and values; then the checkout's two lines, after the open. */
export function RecordWords({
  record,
  evidenceIds,
  checkout = null,
}: {
  record: RecordRead | null;
  /** Per element, the signed events that support it (a bought record's inspection). */
  evidenceIds?: Record<string, string[]>;
  /** The checkout beside the opens, already in words. */
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
        The record
      </Text>
      {record.elements.map((el) => {
        const lines = elementLines(el);
        return (
          <BlockStack key={el.element} gap="200">
            <Divider />
            <InlineStack align="space-between" gap="200" blockAlign="center">
              <Text as="h4" variant="headingSm">
                {el.label}
              </Text>
              <Badge>{LEVEL_WORDS[el.status] ?? el.status}</Badge>
            </InlineStack>
            {lines.length ? (
              <Lines lines={lines} />
            ) : (
              <Text as="p" tone="subdued">
                Not recorded
              </Text>
            )}
            {evidenceIds?.[el.element] ? (
              <Text as="p" variant="bodySm" tone="subdued" breakWord>
                {evidenceIds[el.element].length ? `Evidence: ${evidenceIds[el.element].join(", ")}` : "No evidence event supplied"}
              </Text>
            ) : null}
          </BlockStack>
        );
      })}
      {checkout && checkout.length ? (
        // THE CHECKOUT BESIDE THE OPENS: two lines under the open — what the
        // checkout was, and how the opens compare with it. Counts and facts, no verdict.
        <BlockStack gap="200">
          <Divider />
          <Lines lines={checkout} />
        </BlockStack>
      ) : null}
    </BlockStack>
  );
}

/** The checks against the published key, as the server ran them: one headline, two lines. */
export function RecordChecksWords({ checks }: { checks: RecordChecks | null | undefined }) {
  if (!checks) return null;
  return (
    <BlockStack gap="100">
      <Text as="h3" variant="headingMd">
        Checks
      </Text>
      <Text as="p" fontWeight="semibold">
        {checks.headline}
      </Text>
      {checks.lines.map((line) => (
        <Text key={line} as="p" variant="bodySm" tone="subdued">
          {line}
        </Text>
      ))}
    </BlockStack>
  );
}

/** Every signed event, one line each: its place, what it was, when, and what the check found. */
export function RecordEventWords({ events }: { events: RecordEvent[] | null | undefined }) {
  if (!events || events.length === 0) return null;
  return (
    <BlockStack gap="100">
      <Text as="h3" variant="headingMd">
        Signed events
      </Text>
      {events.map((e) => (
        <Box key={e.event_id ?? `${e.seq}-${e.at}`} paddingBlock="100">
          <InlineStack align="space-between" blockAlign="baseline" gap="200">
            <Text as="span" variant="bodySm">
              {`${e.seq != null ? `${e.seq} · ` : ""}${e.type}${e.legacy ? " · pre-chain" : ""}`}
            </Text>
            <Text as="span" variant="bodySm" tone="subdued" alignment="end">
              {`${when(e.at)} · ${e.check}`}
            </Text>
          </InlineStack>
        </Box>
      ))}
    </BlockStack>
  );
}
