import { useEffect, useState } from "react";
import { Banner, BlockStack, Button, Card, ChoiceList, InlineStack, Text } from "@shopify/polaris";
import {
  BUYER_DOOR_CHOICE_WORDS,
  BUYER_DOOR_HEADING,
  buyerDoorNowSentence,
  buyerDoorSourceSentence,
  type BuyerDoorAnswer,
  type BuyerDoorChoice,
  type BuyerDoorView,
} from "../lib/buyer-door-choice";

// WHERE THE TRACKING LINK GOES — the one card both apps draw (ink's Settings,
// the Ritualist's Settings › Delivery), the same control as the Ritualist
// dashboard's (app/lib/buyer-door-choice.ts). It says what the store does now
// and where that came from, then the choices this store has; Save hands one
// word to the app's own server. Every word is PLACEHOLDER for Sam.
export default function BuyerDoorCard({
  answer,
  result,
  saving,
  onSave,
  hideHeading = false,
}: {
  /** The Ritualist's Delivery tab names the section beside the card. */
  hideHeading?: boolean;
  /** The last save's answer, said at the top of the card. */
  result?: BuyerDoorAnswer | null;
  /** The server's read: the view, or why there is none. Null while loading. */
  answer: BuyerDoorAnswer | null | undefined;
  saving: boolean;
  onSave: (choice: BuyerDoorChoice) => void;
}) {
  const view: BuyerDoorView | null = answer?.ok ? answer.view : null;
  const [draft, setDraft] = useState<BuyerDoorChoice | null>(view?.choice ?? null);
  useEffect(() => setDraft(view?.choice ?? null), [view?.choice]);
  const dirty = Boolean(view && draft && draft !== view.choice);

  return (
    <Card>
      <BlockStack gap="300">
        {!hideHeading && (
          <Text as="h2" variant="headingMd">
            {BUYER_DOOR_HEADING}
          </Text>
        )}
        {result && (result.ok ? <Banner tone="success">Saved.</Banner> : <Banner tone="critical">{result.error}</Banner>)}
        {!answer ? (
          <Text as="p" tone="subdued">Reading this store's setting…</Text>
        ) : !view ? (
          <Text as="p" tone="subdued">{answer.ok ? "" : answer.error}</Text>
        ) : (
          <>
            <BlockStack gap="100">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                <span data-testid="buyer-door-now">{`Now: ${buyerDoorNowSentence(view)}`}</span>
              </Text>
              <Text as="p" tone="subdued">
                <span data-testid="buyer-door-source">{buyerDoorSourceSentence(view)}</span>
              </Text>
            </BlockStack>
            <ChoiceList
              title={BUYER_DOOR_HEADING}
              titleHidden
              name="buyer_door_choice"
              choices={view.choices.map((c) => ({
                label: BUYER_DOOR_CHOICE_WORDS[c].title,
                value: c,
                helpText: BUYER_DOOR_CHOICE_WORDS[c].detail,
              }))}
              selected={draft ? [draft] : []}
              onChange={(values) => setDraft((values[0] as BuyerDoorChoice) ?? null)}
              disabled={saving}
            />
            <InlineStack gap="300">
              <Button variant="primary" loading={saving} disabled={!dirty} onClick={() => draft && onSave(draft)}>
                Save
              </Button>
            </InlineStack>
          </>
        )}
      </BlockStack>
    </Card>
  );
}
