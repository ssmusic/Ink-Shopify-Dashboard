// INK'S HOME — the orders and their records, inside Shopify.
//
// Mounted under APP_FLAVOR=ink only (server/ink-mounts.mjs).
//
// Sam, 2026-09-23, on the first version of this screen: "Your mark? thats
// weird to see" · "remove the open your dashboard … were doing everything
// inside this shopify app" · "we need to be showing the record". So the
// screen is no longer about the merchant's logo (ink's default buyer moment
// is the white page — nothing of the brand is shown, so there is nothing to
// confirm) and no longer a door out to the dashboard: it is the orders, each
// opening on its record, with the record's door at the bottom of it
// (components/InkRecentOrders.tsx).
//
// The install still captures the storefront's mark and claims the brand's
// host (services/ink-install.server.ts) — the host is the tracking link's —
// it simply is not this screen's business.
//
// Every visible string is PLACEHOLDER copy — Sam writes the words.

import { useEffect } from "react";
import {
  useLoaderData,
  useRevalidator,
  useRouteError,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Banner, BlockStack, Box, Card, Layout, Page, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { readInkMerchant, stageOf } from "../services/ink-merchant.server";
import { readRecentOrderRecords } from "../services/ink-links.server";
import { readRecordDoors, recordDoorFor } from "../services/record-charges.server";
import { readRecords } from "../services/ink-record.server";
import InkRecentOrders from "../components/InkRecentOrders";

// While a fresh install is still provisioning (no api key yet), the doors
// cannot be read; the screen asks again every few seconds for a while.
const POLL_MS = 3_000;
const POLL_LIMIT = 25;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [view, recentOrders] = await Promise.all([
    readInkMerchant(session.shop),
    readRecentOrderRecords(admin),
  ]);
  const proofIds = recentOrders.map((o) => o.proofId);
  // THE RECORD'S DOOR (services/record-door.server.ts): a price on the row
  // only when the merchant is priced AND the kill switch is on. THE RECORD'S
  // WORDS (services/ink-record.server.ts): free, every row, read side by side.
  const [doors, records] = await Promise.all([
    readRecordDoors(admin, view, proofIds),
    readRecords(proofIds),
  ]);
  return {
    stage: stageOf(view.doc),
    recentOrders: recentOrders.map((o) => ({
      id: o.id,
      name: o.name,
      proofId: o.proofId,
      detail: o.detail,
      record: o.proofId ? records[o.proofId] ?? null : null,
      door: recordDoorFor(doors, o.proofId),
    })),
  };
};

export default function InkHome() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const settingUp = data.stage === "provisioning";

  useEffect(() => {
    if (!settingUp) return;
    let polls = 0;
    const timer = setInterval(() => {
      polls += 1;
      if (polls > POLL_LIMIT) {
        clearInterval(timer);
        return;
      }
      if (revalidator.state === "idle") revalidator.revalidate();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [settingUp, revalidator]);

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {settingUp && (
              // PLACEHOLDER copy
              <Banner tone="info">Setting up your store…</Banner>
            )}

            {/* THE ORDERS — the Ritualist's list; each row opens on its
                record, and the record's door is at the bottom of it. */}
            <Card padding="0">
              <Box padding="400">
                {/* PLACEHOLDER copy */}
                <Text as="h2" variant="headingMd">Recent orders</Text>
              </Box>
              <InkRecentOrders orders={data.recentOrders} returnTo="/app/ink" />
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// EVERY EMBEDDED ROUTE NEEDS SHOPIFY'S BOUNDARY (app.settings.tsx tells the
// story of the "200 error page"): a reauthorize throw must reach App Bridge,
// not React Router's status renderer.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
