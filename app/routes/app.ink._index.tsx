// INK'S HOME — the Dashboard, the orders and their records, the Records and
// Help, inside Shopify.
//
// Mounted under APP_FLAVOR=ink only (server/ink-mounts.mjs).
//
// Sam, 2026-09-23, on the first version of this screen: "Your mark? thats
// weird to see" · "remove the open your dashboard … were doing everything
// inside this shopify app" · "we need to be showing the record". So the
// screen is the orders, each opening on its record, with the record's door
// in it (components/InkRecentOrders.tsx) — searched, sorted and paged (Sam:
// "need to be able to sort the orders and search the orders").
//
// The pills sit on top of it (components/InkPillNav.tsx): Dashboard (the same
// route, ?view=insights — three numbers, the orders' funnel and the rates,
// components/DeliveryDashboard.tsx; Sam: "dashboard should be first in the
// nav"), Orders (this screen), Records (?view=records — every record this
// shop bought, to download again), Settings (/app/ink/settings) and Help
// (?view=help, which needs no ink read, so it answers during setup or an
// outage).
//
// THE WHOLE RECORD, EVERY ROW (Sam, 2026-09-23: "the 29 gets it signed"):
// each order's record is read whole with the shop's own key, its signatures
// checked against the published key — read once for the screen — and the
// price buys the hand-over (services/ink-billing.server.ts). A bought
// record's dispute packet is read here and shown in its row
// (services/ink-packet.server.ts). Every response is private and never cached.
//
// The install still captures the storefront's mark and claims the brand's
// host (services/ink-install.server.ts) — the host is the tracking link's —
// it simply is not this screen's business.
//
// Every visible string is PLACEHOLDER copy — Sam writes the words.

import { useEffect, useRef, useState } from "react";
import {
  data as routeData,
  useLoaderData,
  useSearchParams,
  useNavigation,
  useRevalidator,
  useRouteError,
  type HeadersFunction,
  type LinksFunction,
  type LoaderFunctionArgs,
} from "react-router";
import polarisVizCss from "@shopify/polaris-viz/build/esm/styles.css?url";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Banner, BlockStack, Box, Card, Layout, Page, Pagination, Text } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { readInkMerchant, stageOf } from "../services/ink-merchant.server";
import { readRecentOrderPage } from "../services/ink-links.server";
import { inkDoor } from "../services/ink-billing.server";
import { readRecordDoors, recordDoorFor } from "../services/record-charges.server";
import { readJwks } from "../services/ink-record.server";
import { readDisputePacket } from "../services/ink-packet.server";
import { readInkKpis } from "../services/ink-kpis.server";
import InkRecentOrders from "../components/InkRecentOrders";
import InkPillNav from "../components/InkPillNav";
import DeliveryDashboard from "../components/DeliveryDashboard";
import { readTimelines } from "../services/ink-timeline.server";
import { readDeliveryDashboard } from "../services/ink-delivery.server";
import { readInkRecordHistory } from "../services/ink-record-history.server";
import InkRecordHistory from "../components/InkRecordHistory";
import InkHelp from "../components/InkHelp";
import InkOrderSearch from "../components/InkOrderSearch";
import { orderSearch, orderSort, orderSearchParams } from "../lib/ink-order-search";

// Shopify's charts (Polaris Viz). The map is Google's (components/OpensMap.tsx) and brings its own.
export const links: LinksFunction = () => [{ rel: "stylesheet", href: polarisVizCss }];

// While a fresh install is still provisioning (no api key yet), the doors
// cannot be read; the screen asks again every few seconds for a while.
const POLL_MS = 3_000;
const POLL_LIMIT = 25;

const NO_DOOR = {
  record: null,
  offerLine: null,
  pending: false,
  paidPendingRecord: false,
  resumeUrl: null,
  downloadable: false,
  inHistory: false,
};

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const params = new URL(request.url).searchParams;
  const requestedSection = params.get("view");
  // Help stays available during provisioning or an ink data outage.
  // Shopify authentication above still applies.
  if (requestedSection === "help") {
    return routeData({ section: "help" as const, stage: null }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const section: "orders" | "insights" | "records" =
    requestedSection === "insights" || requestedSection === "records"
      ? requestedSection
      : "orders";
  const view = await readInkMerchant(session.shop);
  const stage = stageOf(view.doc);

  // Every merchant read below goes with the merchant's OWN key — the shop is
  // the key's; the admin secret never scopes a merchant read.
  const apiKey = view.doc?.ink_api_key ?? null;

  if (section === "records") {
    const requestedPage = Number(params.get("page") || "1");
    const history = await readInkRecordHistory(session.shop, requestedPage).catch(() => null);
    const keys = apiKey && history?.rows.length ? readJwks() : null;
    const recordHistory = history
      ? await Promise.all(history.rows.map(async (row) => {
          const door = await inkDoor(admin, session.shop, apiKey, row.proofId, keys).catch(() => null);
          return {
            ...row,
            orderName: row.orderName || door?.record?.summary.order_number || null,
            record: door?.record || null,
            door: door ? {
              offerLine: null,
              pending: door.pending,
              paidPendingRecord: door.paidPendingRecord,
              resumeUrl: door.resumeUrl,
              downloadable: door.downloadable,
              inHistory: true,
            } : null,
          };
        }))
      : [];
    return routeData({
      section,
      stage,
      historyError: history === null,
      recordHistory,
      historyPage: history?.page || 1,
      historyHasNext: history?.hasNext || false,
      historyHasPrevious: history?.hasPrevious || false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (section === "insights") {
    const [kpis, delivery] = await Promise.all([
      readInkKpis(apiKey),
      readDeliveryDashboard(apiKey),
    ]);
    return routeData(
      {
        section,
        stage,
        kpis,
        delivery,
        recentOrders: [],
        pageInfo: null,
        ordersError: false,
        mapsKey: null,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  // A failed read is said as one — never as "No orders yet".
  let ordersError = false;
  const search = orderSearch(params.get("q"));
  const sort = orderSort(params.get("sort"));
  const cursor = (key: string) => {
    const value = params.get(key);
    return value && value.length <= 1024 ? value : null;
  };
  const page = await readRecentOrderPage(admin, {
    search,
    sort,
    after: cursor("after"),
    before: cursor("before"),
  }).catch(() => {
    ordersError = true;
    return { rows: [], pageInfo: null };
  });
  const recentOrders = page.rows;
  const proofIds = recentOrders.map((o) => o.proofId);
  // The published keys, read once for the screen: every record's signatures are checked against them.
  const keys = apiKey && proofIds.some(Boolean) ? readJwks() : null;
  const [doors, purchases] = await Promise.all([
    // THE RECORD AND ITS DOOR (services/ink-billing.server.ts): a charge this
    // app reserved is settled first, then the WHOLE record is read with the
    // shop's own key, and the door says what the hand-over is.
    Promise.all(recentOrders.map((o) => inkDoor(admin, session.shop, apiKey, o.proofId, keys).catch(() => NO_DOOR))),
    // THE PURCHASES (services/record-charges.server.ts): a bought record's
    // packet and its "Did you win?" — and any charge made before ink's own
    // reservations, settled as it always was.
    readRecordDoors(admin, view, proofIds).catch(() => ({})),
  ]);
  const records = Object.fromEntries(
    recentOrders.flatMap((o, i) =>
      o.proofId && doors[i].record ? [[o.proofId, doors[i].record!]] : [],
    ),
  );
  const timelines = await readTimelines(apiKey, proofIds, fetch, records);
  const rows = recentOrders.map((o, i) => ({
    id: o.id,
    name: o.name,
    proofId: o.proofId,
    detail: o.detail,
    record: doors[i].record,
    door: {
      offerLine: doors[i].offerLine,
      pending: doors[i].pending,
      paidPendingRecord: doors[i].paidPendingRecord,
      resumeUrl: doors[i].resumeUrl,
      downloadable: doors[i].downloadable,
      inHistory: doors[i].inHistory,
      purchase: recordDoorFor(purchases, o.proofId).purchase,
    },
    timeline: o.proofId ? (timelines[o.proofId] ?? null) : null,
  }));
  // A BOUGHT RECORD'S PACKET, read with the purchase's own key — only the
  // three texts Shopify's dispute form takes ever reach the screen.
  const packets = await Promise.all(
    rows.map((r) => (r.proofId && r.door.purchase?.packet_url ? readDisputePacket(r.proofId, r.door.purchase.packet_url) : Promise.resolve(null))),
  );
  return routeData(
    {
      section,
      stage,
      kpis: null,
      delivery: null,
      ordersError,
      search,
      sort,
      pageInfo: page.pageInfo,
      recentOrders: rows.map((r, i) => ({ ...r, packet: packets[i] })),
      // A BROWSER key, referrer-restricted to this app's hosts and to the Maps
      // JavaScript API alone — never the backend's server key (components/OpensMap.tsx).
      mapsKey: process.env.GOOGLE_MAPS_BROWSER_KEY || null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
};

export default function InkHome() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const [params, setParams] = useSearchParams();
  const go = (key: "after" | "before", cursor: string | null) => {
    if (!cursor) return;
    const next = new URLSearchParams(params);
    next.delete("after");
    next.delete("before");
    next.set(key, cursor);
    setParams(next);
  };
  const goRecordPage = (page: number) => {
    const next = new URLSearchParams(params);
    next.set("view", "records");
    next.set("page", String(page));
    setParams(next);
  };
  const pollDeadline = useRef<number | null>(null);
  const [pollingEnded, setPollingEnded] = useState(false);
  const settingUp = data.stage === "provisioning";

  useEffect(() => {
    if (!settingUp) {
      pollDeadline.current = null;
      setPollingEnded(false);
      return;
    }
    if (pollDeadline.current === null)
      pollDeadline.current = Date.now() + POLL_MS * POLL_LIMIT;
    const timer = setInterval(() => {
      if (Date.now() >= pollDeadline.current!) {
        clearInterval(timer);
        setPollingEnded(true);
        return;
      }
      if (revalidator.state === "idle") revalidator.revalidate();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [settingUp, revalidator]);

  return (
    <Page
      backAction={data.section === "insights" ? undefined : {
        content: "Dashboard", url: "/app/ink?view=insights",
      }}
      title={data.section === "insights" ? "Dashboard" : data.section === "records" ? "Records" : data.section === "help" ? "Help" : "Orders"}
      secondaryActions={data.section === "help" ? [] : [
        {
          content: "Refresh",
          loading: revalidator.state !== "idle",
          onAction: () => revalidator.revalidate(),
        },
      ]}
    >
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            <InkPillNav active={data.section} />

            {settingUp && (
              <Banner tone="info">
                {pollingEnded
                  ? "Store setup is taking longer than expected. Refresh to try again."
                  : "Setting up your store…"}
              </Banner>
            )}

            {data.section === "help" ? (
              <InkHelp />
            ) : data.section === "insights" ? (
              <DeliveryDashboard kpis={data.kpis} delivery={data.delivery} />
            ) : data.section === "records" ? (
              <InkRecordHistory
                rows={data.recordHistory}
                error={data.historyError}
                hasNext={data.historyHasNext && navigation.state === "idle"}
                hasPrevious={data.historyHasPrevious && navigation.state === "idle"}
                onNext={() => goRecordPage(data.historyPage + 1)}
                onPrevious={() => goRecordPage(data.historyPage - 1)}
              />
            ) : (
              /* THE ORDERS — each row opens on its record, and the record's
                 door is in it. */
              <Card padding="0">
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">
                      Recent orders
                    </Text>
                    <Text as="p" tone="subdued">
                      Orders from the past 60 days. Open one to review its delivery and opens.
                    </Text>
                    <InkOrderSearch
                      search={data.search || ""}
                      sort={data.sort || "newest"}
                      pending={navigation.state !== "idle"}
                      onChange={(search, sort) => setParams(orderSearchParams(params, search, sort))}
                    />
                  </BlockStack>
                </Box>
                {data.ordersError ? (
                  <Banner tone="info">
                    Orders could not be loaded. Refresh to try again.
                  </Banner>
                ) : (
                  <InkRecentOrders
                    key={`${data.search}:${data.sort}:${params.get("after")}:${params.get("before")}`}
                    orders={data.recentOrders}
                    returnTo="/app/ink"
                    searching={Boolean(data.search)}
                    mapsKey={data.mapsKey}
                  />
                )}
                {data.pageInfo &&
                  (data.pageInfo.hasPreviousPage ||
                    data.pageInfo.hasNextPage) && (
                    <Box padding="400">
                      <Pagination
                        hasPrevious={
                          data.pageInfo.hasPreviousPage &&
                          navigation.state === "idle"
                        }
                        hasNext={
                          data.pageInfo.hasNextPage &&
                          navigation.state === "idle"
                        }
                        onPrevious={() =>
                          go("before", data.pageInfo!.startCursor)
                        }
                        onNext={() => go("after", data.pageInfo!.endCursor)}
                        previousTooltip="Previous page"
                        nextTooltip="Next page"
                      />
                    </Box>
                  )}
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

export const headers: HeadersFunction = (args) => {
  const headers = new Headers(boundary.headers(args));
  headers.set("Cache-Control", "private, no-store");
  return headers;
};
