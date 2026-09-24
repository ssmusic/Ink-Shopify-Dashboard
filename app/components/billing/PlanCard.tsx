// This app is FREE at App Store submission. The Partner Dashboard exposes one
// public Free plan, so there is no charge to approve and no invoice. This card
// must not imply otherwise: paid plan language rendered here
// while the listing's pricing field reads "Free" is exactly the inconsistency
// that got the app rejected (requirement 1.2.1).
//
// If paid tiers are ever configured, they run through Shopify (Managed
// Pricing) and this card gains a link to SHOPIFY's own plan picker — built
// from a VERIFIED app handle, never a guessed one. Do not resurrect the
// hardcoded `ink-verified-delivery` fallback: it was never measured against
// the Partner Dashboard, SHOPIFY_APP_HANDLE is set in no environment, and it
// would have put a Shopify 404 in front of the reviewer.
//
// Drawn in Polaris (2026-09-24), as ink's cards are: the same words.
import { BlockStack, Card, Text } from "@shopify/polaris";

const PlanCard = () => {
  return (
    <Card>
      <BlockStack gap="200">
        <Text as="h2" variant="headingMd">
          Cost
        </Text>
        <Text as="p" fontWeight="medium">
          Your Shopify plan is Free.
        </Text>
        {/* PROSE, not the mark: parallelreturns #644 is the naming authority —
            "The Ritualist" sentence-initial, "the Ritualist" mid-sentence, bare
            "Ritualist" adjectival. Only the app-name field and the wordmark are
            lowercase `the ritualist`. The two cases are both correct and must
            not be flattened into each other. */}
        <Text as="p" tone="subdued">
          There is no subscription charge, trial, usage fee, or off-platform
          invoice. Installing the app creates no charge. If paid plans are
          introduced later, you&rsquo;ll choose and approve one inside Shopify
          &mdash; nothing will start on its own.
        </Text>
      </BlockStack>
    </Card>
  );
};

export default PlanCard;
