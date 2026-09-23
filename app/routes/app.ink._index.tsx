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
// Three pills sit on top of it ("yeah we need a pill nav in the app", Sam,
// 2026-09-23 — components/InkPillNav.tsx): Orders (this screen), Dashboard
// (the same route, ?view=insights — three numbers and the orders' funnel,
// components/DeliveryDashboard.tsx; Sam: "which prob should be called a
// dashboard") and Settings (/app/ink/settings). A bought record's dispute packet is read
// here and shown in its row (services/ink-packet.server.ts).
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
  type LinksFunction,
  type LoaderFunctionArgs,
} from "react-router";
import polarisVizCss from "@shopify/polaris-viz/build/esm/styles.css?url";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Banner, BlockStack, Box, Card, Layout, Page, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { readInkMerchant, stageOf } from "../services/ink-merchant.server";
import { readRecentOrders } from "../services/ink-links.server";
import { readRecordDoors, recordDoorFor } from "../services/record-charges.server";
import { readRecords } from "../services/ink-record.server";
import { readDisputePacket } from "../services/ink-packet.server";
import { readInkKpis } from "../services/ink-kpis.server";
import InkRecentOrders from "../components/InkRecentOrders";
import InkPillNav from "../components/InkPillNav";
import DeliveryDashboard from "../components/DeliveryDashboard";
import { readTimelines, withRecordOpen } from "../services/ink-timeline.server";
import { readDeliveryDashboard } from "../services/ink-delivery.server";

// Shopify's charts (Polaris Viz). The map is Google's (components/OpensMap.tsx) and brings its own.
export const links: LinksFunction = () => [{ rel: "stylesheet", href: polarisVizCss }];

// While a fresh install is still provisioning (no api key yet), the doors
// cannot be read; the screen asks again every few seconds for a while.
const POLL_MS = 3_000;
const POLL_LIMIT = 25;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const section: "orders" | "insights" = new URL(request.url).searchParams.get("view") === "insights" ? "insights" : "orders";
  const view = await readInkMerchant(session.shop);
  const stage = stageOf(view.doc);

  // Every merchant read below goes with the merchant's OWN key — the shop is
  // the key's; the admin secret never scopes a merchant read.
  const apiKey = view.doc?.ink_api_key ?? null;

  if (section === "insights") {
    const [kpis, delivery] = await Promise.all([readInkKpis(apiKey), readDeliveryDashboard(apiKey)]);
    return { section, stage, kpis, delivery, recentOrders: [], mapsKey: null };
  }

  // A failed read is said as one — never as "No orders yet".
  const { rows: recentOrders, readFailed: ordersUnread } = await readRecentOrders(admin);
  const proofIds = recentOrders.map((o) => o.proofId);
  // THE RECORD'S DOOR (services/record-door.server.ts): a price on the row
  // only when the merchant is priced AND the kill switch is on. THE RECORD
  // (services/ink-record.server.ts): the WHOLE record, every row, read side by
  // side with the shop's own key — the merchant sees all of it (Sam,
  // 2026-09-23); the price buys the hand-over.
  const [doors, records, timelines] = await Promise.all([
    readRecordDoors(admin, view, proofIds),
    readRecords(proofIds, fetch, apiKey),
    readTimelines(apiKey, proofIds),
  ]);
  const rows = recentOrders.map((o) => ({
    id: o.id,
    name: o.name,
    proofId: o.proofId,
    detail: o.detail,
    record: o.proofId ? records[o.proofId] ?? null : null,
    door: recordDoorFor(doors, o.proofId),
    // Without the opens door, the first open's words are the record's own.
    timeline: o.proofId ? withRecordOpen(timelines[o.proofId] ?? null, records[o.proofId]) : null,
  }));
  // A BOUGHT RECORD'S PACKET, read with the purchase's own key — only the
  // three texts Shopify's dispute form takes ever reach the screen.
  const packets = await Promise.all(
    rows.map((r) => (r.proofId && r.door.purchase?.packet_url ? readDisputePacket(r.proofId, r.door.purchase.packet_url) : Promise.resolve(null))),
  );
  return {
    section,
    stage,
    kpis: null,
    delivery: null,
    ordersUnread,
    recentOrders: rows.map((r, i) => ({ ...r, packet: packets[i] })),
    // A BROWSER key, referrer-restricted to this app's hosts and to the Maps
    // JavaScript API alone — never the backend's server key (components/OpensMap.tsx).
    mapsKey: process.env.GOOGLE_MAPS_BROWSER_KEY || null,
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
            <InkPillNav active={data.section === "insights" ? "insights" : "orders"} />

            {settingUp && (
              // PLACEHOLDER copy
              <Banner tone="info">Setting up your store…</Banner>
            )}

            {data.section === "insights" ? (
              <DeliveryDashboard kpis={data.kpis} delivery={data.delivery} />
            ) : (
              /* THE ORDERS — the Ritualist's list; each row opens on its
                 record, and the record's door is at the bottom of it. */
              <Card padding="0">
                <Box padding="400">
                  {/* PLACEHOLDER copy */}
                  <Text as="h2" variant="headingMd">Recent orders</Text>
                </Box>
                <InkRecentOrders orders={data.recentOrders} returnTo="/app/ink" mapsKey={data.mapsKey} unread={"ordersUnread" in data && data.ordersUnread === true} />
              </Card>
            )}
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
