// A BOUGHT (OR FREE) RECORD, INSPECTED — the hand-over's own detail, in the app.
//
// Sam, 2026-09-23: "the ritualist does the advanced thing already and it looks
// pretty good" · "i want it all" · "has to be so compelling that someone will
// want to download the $29 record" · "they need to see all the info but not get
// the signed hash". Every order already shows the whole record in words, with
// its signatures checked on the server against the published key
// (components/InkRecordEvidence.tsx, services/ink-record.server.ts). Once the
// hand-over is the merchant's — bought, or free — this opens the signed events
// themselves: each event's ids, hashes, key and signature, re-hashed and
// re-linked here in the browser, each signature said as the server's check
// found it.
//
// Every visible string is PLACEHOLDER copy — Sam's words replace it.
import { useEffect, useRef, useState } from "react";
import { useFetcher } from "react-router";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  InlineGrid,
  InlineStack,
  SkeletonBodyText,
  Text,
} from "@shopify/polaris";
import type { action } from "../routes/app.record";
import {
  checkInkInspection,
  type BrowserRecordCheck,
  type InkInspection,
  type InspectEvent,
} from "../lib/ink-record-inspection";
import { RecordChecksWords, RecordWords, type WordLine } from "./InkRecordEvidence";
import { eventWords, when, type RecordRead } from "../lib/record-words";
import { OpensAgainstAddress, type OrderTimelineData } from "./OrderTimeline";

// One vocabulary for the events on every ink screen (lib/record-words.ts).
const eventName = (name: string) => {
  const words = eventWords(name);
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const location = (value: { lat: number; lng: number } | null) =>
  value ? `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}` : "Not shared";

export function RecordEventRow({
  event,
  check,
  signature,
}: {
  event: InspectEvent;
  check: BrowserRecordCheck["events"][number] | undefined;
  /** What the server's check against the published key found of this event's signature. */
  signature?: string | null;
}) {
  return (
    <Box
      background="bg-surface"
      borderColor="border"
      borderWidth="025"
      borderRadius="200"
      padding="300"
    >
      <BlockStack gap="200">
        <InlineStack align="space-between" gap="200" blockAlign="center">
          <Text as="h4" variant="headingSm">
            {event.sequence != null ? `${event.sequence}. ` : ""}
            {eventName(event.type)}
            {event.legacy ? " (earlier event)" : ""}
          </Text>
          <Text as="span" tone="subdued" variant="bodySm">
            {when(event.at)}
          </Text>
        </InlineStack>
        <InlineGrid columns={{ xs: 1, sm: 3 }} gap="200">
          <Text as="p" variant="bodySm">
            {signature
              ? `Signature ${signature}`
              : event.signature
                ? "Signature supplied, not checked"
                : "Signature unavailable"}
          </Text>
          <InlineStack>
            <Badge
              tone={
                check?.hash === "mismatch"
                  ? "critical"
                  : check?.hash === "matches"
                    ? "info"
                    : undefined
              }
            >{`Hash ${check?.hash ?? "not checked"}`}</Badge>
          </InlineStack>
          <InlineStack>
            <Badge
              tone={
                check?.link === "mismatch"
                  ? "critical"
                  : check?.link === "matches"
                    ? "info"
                    : undefined
              }
            >{`Link ${check?.link ?? "not checked"}`}</Badge>
          </InlineStack>
        </InlineGrid>
        {[
          ["Event ID", event.id],
          ["Payload hash", event.payloadHash ?? "Unavailable"],
          [
            "Previous event ID",
            event.previousEventId ?? "First or earlier event",
          ],
          ["Previous hash", event.previousHash ?? "First or earlier event"],
        ].map(([label, value]) => (
          <BlockStack key={label} gap="050">
            <Text as="p" variant="bodySm" tone="subdued">
              {label}
            </Text>
            <Text as="p" variant="bodySm" breakWord>
              {value}
            </Text>
          </BlockStack>
        ))}
        <BlockStack gap="100">
          <Text
            as="p"
            variant="bodySm"
            tone="subdued"
          >{`Signature · Key ${event.keyId ?? "unavailable"}`}</Text>
          <Box background="bg" padding="200" borderRadius="100">
            <Text as="p" variant="bodySm" breakWord>
              {event.signature ?? "Unavailable"}
            </Text>
          </Box>
        </BlockStack>
        {event.location && (
          <Text
            as="p"
            variant="bodySm"
          >{`Location ${location(event.location)}`}</Text>
        )}
        {event.unverifiable && (
          <Text as="p" tone="subdued">
            The stored bytes for this earlier event could not be reproduced.
          </Text>
        )}
      </BlockStack>
    </Box>
  );
}

export default function InkRecordInspection({
  proofId,
  record,
  timeline,
  addressLabel,
  checkout = null,
  mapsKey = null,
  browsers = null,
}: {
  proofId: string;
  record: RecordRead | null;
  timeline?: OrderTimelineData | null;
  addressLabel?: string;
  /** The checkout beside the opens, in words (components/InkRecentOrders.tsx). */
  checkout?: WordLine[] | null;
  /** The Maps JavaScript browser key; none → no map. */
  mapsKey?: string | null;
  /** The record's line about the browsers the opens came from. */
  browsers?: string | null;
}) {
  const fetcher = useFetcher<typeof action>();
  const requested = useRef<string | null>(null);
  const [check, setCheck] = useState<BrowserRecordCheck | null>(null);
  const [checkError, setCheckError] = useState(false);
  const result = fetcher.data;
  const inspection: InkInspection | null =
    result && "inspection" in result && result.inspection?.proofId === proofId
      ? result.inspection
      : null;
  const load = () =>
    fetcher.submit(
      { intent: "inspect", proof_id: proofId },
      { method: "post", action: "/app/record" },
    );
  useEffect(() => {
    if (requested.current === proofId) return;
    requested.current = proofId;
    fetcher.submit(
      { intent: "inspect", proof_id: proofId },
      { method: "post", action: "/app/record" },
    );
  }, [proofId, fetcher]);
  useEffect(() => {
    setCheck(null);
    setCheckError(false);
    if (!inspection) return;
    let live = true;
    checkInkInspection(inspection)
      .then((value) => {
        if (live) setCheck(value);
      })
      .catch(() => {
        if (live) setCheckError(true);
      });
    return () => {
      live = false;
    };
  }, [inspection]);
  const opens =
    inspection?.opens != null
      ? inspection.opens.map((item) => ({
          at: item.at,
          verdict: item.verdict ?? null,
          distance_m: item.distanceM,
          accuracy_m: item.accuracyM,
          lat: item.location?.lat ?? null,
          lng: item.location?.lng ?? null,
        }))
      : (timeline?.opens ?? []);
  return (
    <BlockStack gap="400">
      <RecordWords record={record} evidenceIds={inspection?.evidenceIds} checkout={checkout} />
      <Box background="bg" padding="400" borderRadius="200">
        <RecordChecksWords checks={record?.checks} />
      </Box>
      <Box background="bg" padding="400" borderRadius="200">
        <BlockStack gap="200">
          <Text as="h3" variant="headingMd">
            Checked in this browser
          </Text>
          {result && !result.ok ? (
            <BlockStack gap="200">
              <Text as="p" tone="critical">
                {result.note || "The full record could not be loaded."}
              </Text>
              <InlineStack>
                <Button onClick={load} loading={fetcher.state !== "idle"}>
                  Try again
                </Button>
              </InlineStack>
            </BlockStack>
          ) : !inspection ? (
            <SkeletonBodyText lines={2} />
          ) : check ? (
            <>
              <InlineGrid columns={{ xs: 1, sm: 3 }} gap="300">
                <BlockStack gap="100">
                  <Text as="h4" variant="headingSm">
                    Event hashes
                  </Text>
                  <Text
                    as="p"
                    tone={check.hashFailures ? "critical" : undefined}
                  >{`${check.hashesChecked} of ${inspection.events.length} checked, ${check.hashFailures} mismatches`}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="h4" variant="headingSm">
                    Chain links
                  </Text>
                  <Text
                    as="p"
                    tone={check.linkFailures ? "critical" : undefined}
                  >{`${check.linksChecked} of ${inspection.events.filter((event) => !event.legacy).length} checked, ${check.linkFailures} mismatches`}</Text>
                </BlockStack>
                <BlockStack gap="100">
                  <Text as="h4" variant="headingSm">
                    Sequence
                  </Text>
                  <Text as="p">
                    {check.sequenceComplete == null
                      ? "No linked sequence supplied"
                      : check.sequenceComplete
                        ? "No gaps in supplied events"
                        : "Gap in supplied events"}
                  </Text>
                </BlockStack>
              </InlineGrid>
              <Text
                as="p"
                variant="bodySm"
                tone={check.head === "mismatch" ? "critical" : "subdued"}
              >
                {check.head === "matches"
                  ? "The final event matches the reported chain head."
                  : check.head === "mismatch"
                    ? "The events do not match the reported chain head."
                    : "A chain head was not supplied for comparison."}
              </Text>
            </>
          ) : checkError ? (
            <Text as="p" tone="critical">
              The browser could not check the hashes. Download the JSON file to
              inspect the event bytes.
            </Text>
          ) : (
            <Text as="p">Checking event hashes and links…</Text>
          )}
          <Text as="p" variant="bodySm" tone="subdued">
            Hash and link checks do not confirm physical delivery.
          </Text>
        </BlockStack>
      </Box>
      <OpensAgainstAddress
        address={timeline?.address ?? inspection?.address ?? null}
        opens={opens}
        available={
          inspection?.opens != null ? true : (timeline?.opensAvailable ?? false)
        }
        capped={
          inspection?.opens != null
            ? inspection.opensCapped
            : (timeline?.opensCapped ?? false)
        }
        addressLabel={addressLabel && addressLabel !== "Address unavailable" ? addressLabel : inspection?.addressLabel ?? undefined}
        mapsKey={mapsKey}
        browsers={browsers}
      />
      <Box background="bg" padding="400" borderRadius="200">
        <BlockStack gap="300">
          <InlineStack align="space-between" blockAlign="center" gap="200">
            <Text as="h3" variant="headingMd">
              Event history
            </Text>
            {inspection && (
              <Text
                as="span"
                tone="subdued"
              >{`${inspection.events.length} events supplied`}</Text>
            )}
          </InlineStack>
          {!inspection && (
            <Text as="p" tone="subdued">
              {result && !result.ok
                ? "Event details are unavailable. Retry the record above."
                : "Loading event details…"}
            </Text>
          )}
          {inspection?.events.length === 0 && (
            <Text as="p">No signed events were supplied.</Text>
          )}
          {inspection?.events.map((event) => (
            <RecordEventRow
              key={event.id}
              event={event}
              check={check?.events.find((item) => item.id === event.id)}
              signature={record?.events?.find((item) => item.event_id === event.id)?.check ?? null}
            />
          ))}
        </BlockStack>
      </Box>
    </BlockStack>
  );
}
