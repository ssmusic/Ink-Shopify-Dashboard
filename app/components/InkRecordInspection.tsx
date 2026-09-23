import { useEffect, useState } from "react";
import { useFetcher } from "react-router";
import {
  Badge,
  BlockStack,
  Box,
  Button,
  Collapsible,
  Divider,
  InlineGrid,
  InlineStack,
  Text,
} from "@shopify/polaris";
import type { action } from "../routes/app.record";
import {
  checkInkInspection,
  type BrowserRecordCheck,
  type InkInspection,
  type InspectEvent,
} from "../lib/ink-record-inspection";
import { when } from "../lib/record-words";

const eventName = (name: string) => {
  const known: Record<string, string> = {
    TAP_RECORDED: "Opened",
    LOCATION_SHARED: "Location shared",
    ENROLLED: "Recorded",
    CARRIER_DELIVERED: "Carrier delivered",
    DELIVERY_VERIFIED: "Seen at the door",
  };
  if (known[name]) return known[name];
  const words = name.replace(/_/g, " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
};
const location = (value: { lat: number; lng: number } | null) =>
  value ? `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}` : "Not shared";

function EventRow({
  event,
  check,
}: {
  event: InspectEvent;
  check: BrowserRecordCheck["events"][number] | undefined;
}) {
  const [open, setOpen] = useState(false);
  return (
    <BlockStack gap="200">
      <InlineStack align="space-between" gap="200" blockAlign="center">
        <Button
          variant="plain"
          textAlign="left"
          disclosure={open ? "up" : "down"}
          ariaExpanded={open}
          ariaControls={`event-${event.id}`}
          onClick={() => setOpen((value) => !value)}
        >
          {event.sequence != null ? `${event.sequence}. ` : ""}
          {eventName(event.type)}
          {event.legacy ? " (earlier event)" : ""}
        </Button>
        <Text as="span" tone="subdued">
          {when(event.at)}
        </Text>
      </InlineStack>
      <InlineStack gap="200">
        <Badge
          tone={check?.hash === "mismatch" ? "critical" : "info"}
        >{`Hash ${check?.hash ?? "unavailable"}`}</Badge>
        <Badge
          tone={check?.link === "mismatch" ? "critical" : "info"}
        >{`Link ${check?.link ?? "unavailable"}`}</Badge>
      </InlineStack>
      <Collapsible id={`event-${event.id}`} open={open}>
        <Box padding="300" background="bg-surface-secondary">
          <BlockStack gap="200">
            {[
              ["Event ID", event.id],
              ["Sequence", event.sequence ?? "Not applicable"],
              ["Key ID", event.keyId ?? "Unavailable"],
              ["Payload hash", event.payloadHash ?? "Unavailable"],
              [
                "Previous event ID",
                event.previousEventId ?? "First or earlier event",
              ],
              ["Previous hash", event.previousHash ?? "First or earlier event"],
              ["Signature supplied by ink", event.signature ?? "Unavailable"],
              ["Location", location(event.location)],
            ].map(([label, value]) => (
              <InlineGrid
                key={String(label)}
                columns={{ xs: 1, sm: ["oneThird", "twoThirds"] }}
                gap="100"
              >
                <Text as="span" tone="subdued">
                  {label}
                </Text>
                <Text as="span" breakWord>
                  {String(value)}
                </Text>
              </InlineGrid>
            ))}
            {event.unverifiable && (
              <Text as="p" tone="subdued">
                The stored bytes for this earlier event could not be reproduced.
              </Text>
            )}
          </BlockStack>
        </Box>
      </Collapsible>
    </BlockStack>
  );
}

export default function InkRecordInspection({ proofId }: { proofId: string }) {
  const fetcher = useFetcher<typeof action>();
  const [open, setOpen] = useState(false);
  const [check, setCheck] = useState<BrowserRecordCheck | null>(null);
  const [checkError, setCheckError] = useState(false);
  const result = fetcher.data;
  const inspection: InkInspection | null =
    result && "inspection" in result && result.inspection
      ? result.inspection
      : null;
  useEffect(() => {
    if (!inspection) return;
    let live = true;
    checkInkInspection(inspection)
      .then((value) => {
        if (live) {
          setCheck(value);
          setCheckError(false);
        }
      })
      .catch(() => {
        if (live) setCheckError(true);
      });
    return () => {
      live = false;
    };
  }, [inspection]);
  const toggle = () => {
    if (!open && !inspection)
      fetcher.submit(
        { intent: "inspect", proof_id: proofId },
        { method: "post", action: "/app/record" },
      );
    setOpen((value) => !value);
  };
  return (
    <BlockStack gap="300">
      <Button
        variant="plain"
        textAlign="left"
        disclosure={open ? "up" : "down"}
        ariaExpanded={open}
        ariaControls={`inspection-${proofId}`}
        loading={fetcher.state !== "idle"}
        onClick={toggle}
      >
        Inspect full record
      </Button>
      <Collapsible id={`inspection-${proofId}`} open={open}>
        <BlockStack gap="500">
          {result && !result.ok && result.note && (
            <Text as="p" tone="critical">
              {result.note}
            </Text>
          )}
          {checkError && (
            <Text as="p" tone="critical">
              The browser could not check the event hashes. Download the JSON
              file to inspect the exact event bytes.
            </Text>
          )}
          {inspection && (
            <>
              <BlockStack gap="200">
                <Text as="h3" variant="headingMd">
                  Hash and link checks
                </Text>
                {check ? (
                  <>
                    <Text as="p">{`${check.hashesChecked} event hashes checked; ${check.hashFailures} did not match. ${check.linksChecked} chain links checked; ${check.linkFailures} did not match.`}</Text>
                    <Text as="p">
                      {check.sequenceComplete == null
                        ? "No linked event sequence was supplied."
                        : check.sequenceComplete
                          ? "No gap found in the supplied chain sequence."
                          : "The supplied chain sequence has a gap."}
                    </Text>
                    <Text as="p">
                      {check.head === "matches"
                        ? "The last supplied event matches ink’s reported chain head."
                        : check.head === "mismatch"
                          ? "The supplied events do not match ink’s reported chain head."
                          : "A chain head was not supplied for comparison."}
                    </Text>
                  </>
                ) : !checkError ? (
                  <Text as="p" tone="subdued">
                    Checking supplied hashes and links in this browser…
                  </Text>
                ) : null}
                <Text as="p" tone="subdued">
                  Signatures are shown below as supplied by ink. This app cannot
                  verify them in the browser until ink provides a
                  merchant-scoped public-key endpoint. A matching hash or link
                  does not establish physical delivery.
                </Text>
              </BlockStack>
              <Divider />
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  {inspection.opens != null && !inspection.opensCapped
                    ? "Every open"
                    : "Open history"}
                </Text>
                {inspection.opens == null ? (
                  <Text as="p" tone="subdued">
                    Detailed open history is unavailable from the merchant
                    service. The order summary still shows any recorded first
                    open.
                  </Text>
                ) : inspection.opens.length === 0 ? (
                  <Text as="p" tone="subdued">
                    No person opens were returned.
                  </Text>
                ) : (
                  inspection.opens.map((item, index) => (
                    <BlockStack key={`${item.at}-${index}`} gap="100">
                      <Text as="h4" variant="headingSm">
                        Open {index + 1}
                      </Text>
                      <Text as="p">{when(item.at)}</Text>
                      <Text as="p">
                        {item.distanceM == null
                          ? "Distance unavailable"
                          : `${Math.round(item.distanceM)} m from the delivery address`}
                      </Text>
                      {item.accuracyM != null && (
                        <Text as="p" tone="subdued">
                          Location accuracy {Math.round(item.accuracyM)} m
                        </Text>
                      )}
                      {item.location && (
                        <Text as="p" tone="subdued">
                          Location shared {location(item.location)}
                        </Text>
                      )}
                    </BlockStack>
                  ))
                )}
                {inspection.opensCapped && (
                  <Text as="p" tone="subdued">
                    The merchant service limited the open history returned for
                    this order.
                  </Text>
                )}
              </BlockStack>
              <Divider />
              <BlockStack gap="300">
                <Text as="h3" variant="headingMd">
                  Signed events
                </Text>
                <Text
                  as="p"
                  tone="subdued"
                >{`${inspection.events.length} events supplied by ink. Select an event to inspect its hashes, signature, and any shared location.`}</Text>
                {inspection.events.length === 0 && (
                  <Text as="p">No signed events were supplied.</Text>
                )}
                {inspection.events.map((event) => (
                  <EventRow
                    key={event.id}
                    event={event}
                    check={check?.events.find((item) => item.id === event.id)}
                  />
                ))}
              </BlockStack>
            </>
          )}
        </BlockStack>
      </Collapsible>
    </BlockStack>
  );
}
