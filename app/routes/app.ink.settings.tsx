// INK'S SETTINGS — the forward dial, and the one line that leads up.
//
// Mounted under APP_FLAVOR=ink only (server/ink-mounts.mjs). Two things:
//
//   · THE FORWARD DIAL. After the flash — the brand's mark for a moment, one
//     ask — the buyer is forwarded on. `order_status` sends them to the
//     merchant's own Shopify order page (shows the tracking, asks nothing);
//     `carrier` sends them to the carrier's page. The dial lives on the
//     backend merchant doc (`flash_forward`, ink-backend utils/buyerDoor.js)
//     and is written through the admin door, PATCH /admin/merchants/:id —
//     the backend first, nothing recorded locally, the way the Ritualist's
//     return-window save writes (app.api.settings.notifications.tsx).
//
//   · ADD THE RITUALIST. The paid product that includes ink: one link to
//     its listing, from env RITUALIST_LISTING_URL (a PLACEHOLDER until Sam
//     has the listing's address; the line renders disabled without it).
//
// Every visible string is PLACEHOLDER copy — Sam writes the words.

import { useState } from "react";
import {
  useFetcher,
  useLoaderData,
  useRouteError,
  type ActionFunctionArgs,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Banner,
  BlockStack,
  Button,
  Card,
  ChoiceList,
  InlineStack,
  Layout,
  Page,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { patchMerchant } from "../services/ink-api.server";
import {
  FLASH_FORWARDS,
  flashForwardOf,
  readInkMerchant,
  type FlashForward,
} from "../services/ink-merchant.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const view = await readInkMerchant(session.shop);
  return {
    flashForward: flashForwardOf(view),
    // No shop_id means the install has not landed yet; the dial cannot be
    // written until the backend knows this merchant.
    canSave: Boolean(view.shopId),
    ritualistUrl: process.env.RITUALIST_LISTING_URL || "",
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { session } = await authenticate.admin(request);
  const form = await request.formData();
  const raw = String(form.get("flash_forward") || "");
  if (!(FLASH_FORWARDS as readonly string[]).includes(raw)) {
    return { ok: false, flashForward: null as FlashForward | null, error: "Pick where the buyer goes next." }; // PLACEHOLDER
  }
  const next = raw as FlashForward;

  const view = await readInkMerchant(session.shop);
  if (!view.shopId) {
    return { ok: false, flashForward: null as FlashForward | null, error: "This store is still being set up — try again in a moment." }; // PLACEHOLDER
  }

  // THE BACKEND FIRST. A refusal comes back as its own sentence and nothing
  // is recorded — the screen never shows a dial the backend does not hold.
  try {
    const merchant = await patchMerchant(view.shopId, { flash_forward: next });
    const written = merchant?.flash_forward === "carrier" ? "carrier" : "order_status";
    return { ok: true, flashForward: written as FlashForward, error: null as string | null };
  } catch (err: any) {
    console.error(`[ink settings] flash_forward save failed for ${session.shop}:`, err?.message ?? err);
    return { ok: false, flashForward: null as FlashForward | null, error: "Couldn't save that — nothing was changed." }; // PLACEHOLDER
  }
};

export default function InkSettings() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const saving = fetcher.state !== "idle";
  const [choice, setChoice] = useState<FlashForward>(data.flashForward);
  const saved = fetcher.data?.ok ? fetcher.data.flashForward : data.flashForward;
  const dirty = choice !== saved;

  return (
    // PLACEHOLDER: page title.
    <Page title="Settings">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {fetcher.data?.error && <Banner tone="critical">{fetcher.data.error}</Banner>}
            {fetcher.data?.ok && !dirty && (
              // PLACEHOLDER copy
              <Banner tone="success">Saved.</Banner>
            )}

            <Card>
              <fetcher.Form method="post">
                <BlockStack gap="400">
                  {/* PLACEHOLDER copy */}
                  <Text as="h2" variant="headingMd">After the flash, send the buyer to</Text>
                  <ChoiceList
                    title="Where the buyer goes next"
                    titleHidden
                    name="flash_forward"
                    choices={[
                      {
                        // PLACEHOLDER copy
                        label: "Your Shopify order page",
                        value: "order_status",
                        helpText: "Shows the tracking on your own store and asks for nothing.",
                      },
                      {
                        // PLACEHOLDER copy
                        label: "The carrier's tracking page",
                        value: "carrier",
                        helpText: "UPS, USPS, FedEx — wherever the parcel is.",
                      },
                    ]}
                    selected={[choice]}
                    onChange={(values) => setChoice((values[0] as FlashForward) ?? "order_status")}
                    disabled={!data.canSave || saving}
                  />
                  <InlineStack gap="300">
                    {/* PLACEHOLDER label */}
                    <Button submit variant="primary" loading={saving} disabled={!data.canSave || !dirty}>
                      Save
                    </Button>
                  </InlineStack>
                  {!data.canSave && (
                    // PLACEHOLDER copy
                    <Text as="p" tone="subdued">Your store is still being set up — this will be ready in a moment.</Text>
                  )}
                </BlockStack>
              </fetcher.Form>
            </Card>

            <Card>
              <BlockStack gap="200">
                {/* PLACEHOLDER copy */}
                <Text as="h2" variant="headingMd">Add The Ritualist</Text>
                <Text as="p" tone="subdued">
                  Every order gets its own branded page — live tracking, delivery notifications, returns. in.ink is included.
                </Text>
                <InlineStack>
                  {data.ritualistUrl ? (
                    // PLACEHOLDER label; the address comes from RITUALIST_LISTING_URL.
                    <Button url={data.ritualistUrl} external>Add The Ritualist</Button>
                  ) : (
                    // PLACEHOLDER: no listing address yet (RITUALIST_LISTING_URL unset).
                    <Button disabled>Add The Ritualist</Button>
                  )}
                </InlineStack>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// EVERY EMBEDDED ROUTE NEEDS SHOPIFY'S BOUNDARY (app.settings.tsx tells the
// story of the "200 error page").
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
