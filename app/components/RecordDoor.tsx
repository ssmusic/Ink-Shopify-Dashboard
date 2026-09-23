// THE RECORD'S DOOR on one order row — both flavors (Sam, 2026-09-22: "the
// words are free, the proof is paid").
//
//   priced, not bought, the switch on → "Get the record — $15": the press asks
//     /app/record for Shopify's one-time charge and opens Shopify's approval
//     screen at the top frame. Nothing is billed until the merchant approves.
//   bought → the packet link, and "Did you win?" — the merchant's word, saved
//     on the purchase (the outcome, recorded from day one; never scored).
//   no price, or the switch off → nothing at all.
//
// Every visible string is PLACEHOLDER copy — Sam writes the words.

import { useEffect } from "react";
import { useFetcher } from "react-router";
import { Button, InlineStack, Link, Select, Text } from "@shopify/polaris";
import type { action as recordAction } from "../routes/app.record";

export type RecordDoorProps = {
  proofId: string;
  orderName: string;
  /** Where Shopify's return lands: the screen the press was made on. */
  returnTo: string;
  door: {
    offerLine: string | null;
    purchase: { id: string; packet_url: string | null; outcome: "open" | "won" | "lost" | "unknown" } | null;
  };
  /** ink shows the bought packet inside the app, so its link out is not drawn. */
  hidePacketLink?: boolean;
};

// PLACEHOLDER labels.
const OUTCOME_OPTIONS = [
  { label: "Still open", value: "open" },
  { label: "Won", value: "won" },
  { label: "Lost", value: "lost" },
  { label: "Don't know", value: "unknown" },
];

export default function RecordDoor({ proofId, orderName, returnTo, door, hidePacketLink = false }: RecordDoorProps) {
  const buy = useFetcher<typeof recordAction>();
  const outcome = useFetcher<typeof recordAction>();

  // Shopify's approval screen lives outside the app's frame: open it at the top.
  useEffect(() => {
    const url = buy.data?.confirmationUrl;
    if (url) window.open(url, "_top");
  }, [buy.data]);

  if (door.purchase) {
    const current = (outcome.formData?.get("outcome") as string | null) ?? door.purchase.outcome;
    return (
      <InlineStack gap="300" blockAlign="center" wrap={false}>
        {door.purchase.packet_url && !hidePacketLink && (
          // PLACEHOLDER label
          <Link url={door.purchase.packet_url} target="_blank">Open the record</Link>
        )}
        <Select
          label="Did you win?"
          labelInline
          options={OUTCOME_OPTIONS}
          value={current}
          disabled={outcome.state !== "idle"}
          onChange={(value) =>
            outcome.submit(
              { intent: "outcome", purchase_id: door.purchase!.id, outcome: value },
              { method: "post", action: "/app/record" },
            )
          }
        />
      </InlineStack>
    );
  }

  if (door.offerLine) {
    return (
      <InlineStack gap="200" blockAlign="center" wrap={false}>
        <Button
          loading={buy.state !== "idle"}
          onClick={() =>
            buy.submit(
              { intent: "buy", proof_id: proofId, order_name: orderName, return_to: returnTo },
              { method: "post", action: "/app/record" },
            )
          }
        >
          {door.offerLine}
        </Button>
        {buy.data && !buy.data.ok && buy.data.note && (
          <Text as="span" tone="critical" variant="bodySm">{buy.data.note}</Text>
        )}
      </InlineStack>
    );
  }

  return null;
}
