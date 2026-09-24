import { inkDoor } from "../services/ink-billing.server";
import { readRecordDoors, recordDoorFor } from "../services/record-charges.server";
import { readJwks } from "../services/ink-record.server";
import { readDisputePacket } from "../services/ink-packet.server";
import { useEffect, useRef, useState } from "react";
import {
  data as routeData,
  useLoaderData,
  type ShouldRevalidateFunction,
  useSearchParams,
  useNavigation,
  useRevalidator,
  useRouteError,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Banner,
  BlockStack,
  Box,
  Card,
  Divider,
  InlineStack,
  Layout,
  Page,
  Pagination,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { readInkMerchant, stageOf } from "../services/ink-merchant.server";
import { readRecentOrderPage } from "../services/ink-links.server";
import { readInkKpis } from "../services/ink-kpis.server";
import InkRecentOrders, { type InkRowRecord } from "../components/InkRecentOrders";
import InkPillNav from "../components/InkPillNav";
import DeliveryDashboard from "../components/DeliveryDashboard";
import { readTimelineReads, timelineOfReads } from "../services/ink-timeline.server";
import { readDeliveryDashboard } from "../services/ink-delivery.server";
import { readInkRecordHistory } from "../services/ink-record-history.server";
import InkRecordHistory, { type HistoryItem } from "../components/InkRecordHistory";
import { readRecordPriceOrUnknown } from "../services/ink-api.server";
import InkHelp from "../components/InkHelp";
import InkOrderSearch from "../components/InkOrderSearch";
import { orderSearch, orderSort, orderSearchParams } from "../lib/ink-order-search";

// While a fresh install is still provisioning (no api key yet), the doors
// cannot be read; the screen asks again every few seconds for a while.
const POLL_MS = 3_000;
const POLL_LIMIT = 25;
const ORDERS_PER_PAGE = 20;
// A row whose record could not be read: no record, nothing on offer.
const NO_DOOR = {
  record: null,
  offerLine: null,
  pending: false,
  paidPendingRecord: false,
  resumeUrl: null,
  downloadable: false,
  inHistory: false,
};

// EACH SECTION ITS OWN ADDRESS — /app/ink/orders · /dashboard · /records ·
// /help (Settings is its own route). The admin's left nav marks an item by its
// path, so while every section shared one path and a ?view= query it could not tell
// Orders from Dashboard: Orders was hidden as the home link and Dashboard lit
// up over the Orders screen (Sam, 2026-09-24). /app/ink itself, and every
// older ?view= address, redirect here (routes/app.ink._index.tsx).
export const INK_SECTIONS = {
  orders: "orders",
  dashboard: "insights",
  records: "records",
  help: "help",
} as const;

export const loader = async ({ request, params: routeParams }: LoaderFunctionArgs) => {
  const requestedSection = INK_SECTIONS[routeParams.section as keyof typeof INK_SECTIONS];
  if (!requestedSection) throw new Response(null, { status: 404 });
  const { admin, session } = await authenticate.admin(request);
  const params = new URL(request.url).searchParams;
  // Help stays available during provisioning or an ink data outage.
  // Shopify authentication above still applies.
  if (requestedSection === "help") {
    return routeData({ section: "help" as const, stage: null }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  }
  const section: "orders" | "insights" | "records" = requestedSection;
  const view = await readInkMerchant(session.shop);
  const stage = stageOf(view.doc);

  // Every merchant read below goes with the merchant's OWN key — the shop is
  // the key's; the admin secret never scopes a merchant read.
  const apiKey = view.doc?.ink_api_key ?? null;

  if (section === "records") {
    const requestedPage = Number(params.get("page") || "1");
    const history = await readInkRecordHistory(session.shop, requestedPage).catch(() => null);
    // A STORE WHOSE RECORDS ARE INCLUDED buys none, so its purchase history is
    // always empty and Records only pointed back to Orders (Sam, 2026-09-24,
    // on the Steve Madden test store: "records just sends you back to
    // orders"). When the backend says the record is free there (no price —
    // The Ritualist includes it), Records lists the recent orders' records,
    // each with its downloads; the export door still decides each file.
    let includedRecords: HistoryItem[] | null = null;
    if (history && history.rows.length === 0 && apiKey && view.shopId) {
      const price = await readRecordPriceOrUnknown(view.shopId);
      if (price === null) {
        const recent = await readRecentOrderPage(admin, { first: ORDERS_PER_PAGE }).catch(() => null);
        includedRecords = (recent?.rows ?? [])
          .filter((o) => o.proofId)
          .map((o) => ({
            proofId: o.proofId!,
            orderName: o.name,
            createdAt: o.createdAt,
            state: "included",
            door: { offerLine: null, downloadable: true },
            record: null,
          }));
      }
    }
    // The published keys, read once: each record's signatures are checked against them (#137).
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
      // The browser key for the open section's maps (components/OpensMap.tsx).
      mapsKey: process.env.GOOGLE_MAPS_BROWSER_KEY || null,
      historyError: history === null,
      recordHistory,
      includedRecords,
      historyPage: history?.page || 1,
      historyHasNext: history?.hasNext || false,
      historyHasPrevious: history?.hasPrevious || false,
    }, { headers: { "Cache-Control": "private, no-store" } });
  }

  if (section === "insights") {
    const [insights, delivery] = await Promise.all([
      readInkKpis(apiKey),
      readDeliveryDashboard(apiKey),
    ]);
    // "Location shared" is the orders with an open that shared a location —
    // the delivery rows' count (lib/delivery-insights.ts sharedLocation), the
    // same orders the funnel's step counts. merchant-insights' own number is
    // a first open's alone: 3 where 16 had shared on the Steve Madden test
    // store (Sam, 2026-09-24).
    const kpis =
      insights && delivery && delivery.locationShared <= insights.recorded
        ? { ...insights, locationShared: delivery.locationShared }
        : insights;
    return routeData(
      {
        section,
        stage,
        kpis,
        delivery,
        recentOrders: [],
        pageInfo: null,
        ordersError: false,
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  let ordersError = false;
  const search = orderSearch(params.get("q"));
  const sort = orderSort(params.get("sort"));
  const cursor = (key: string) => {
    const value = params.get(key);
    return value && value.length <= 1024 ? value : null;
  };
  // Twenty to a page — the Ritualist's ledger shows the whole list on one
  // screen; ink reads each order's record in parallel, so a page of twenty
  // costs about what five did (measured on Corvara, 2026-09-24).
  const page = await readRecentOrderPage(admin, {
    first: ORDERS_PER_PAGE,
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
  // The published keys, read once for the screen: every record's signatures
  // are checked against them on the server (#137).
  const keys = apiKey && proofIds.some(Boolean) ? readJwks() : null;
  // A bought record's "Did you win?" and its texts for Shopify's dispute
  // form (services/record-charges.server.ts) — only once it is bought. One
  // read for the page, shared by every row.
  const purchasesRead = readRecordDoors(admin, view, proofIds).catch(() => ({}));
  // EACH ROW STREAMS. The page answers with Shopify's orders alone; each row's
  // record, its activity and a bought record's packet follow as that row's own
  // promise, drawn as it lands (components/InkRecentOrders.tsx). A record's
  // whole read takes time in proportion to the record (0.5 s for a few opens,
  // 5.4 s for 92 — Steve Madden's test store, 2026-09-24): the list used to
  // wait for its slowest record and then read every timeline after it, 10 to
  // 15 s before any order showed. Now a row's reads run side by side and the
  // timeline is made from them exactly as before.
  const rowRecord = async (proofId: string | null): Promise<InkRowRecord> => {
    try {
      const [door, reads, purchases] = await Promise.all([
        inkDoor(admin, session.shop, apiKey, proofId, keys).catch(() => NO_DOOR),
        apiKey && proofId ? readTimelineReads(apiKey, proofId, fetch) : Promise.resolve(null),
        purchasesRead,
      ]);
      const purchase = proofId ? recordDoorFor(purchases, proofId).purchase : null;
      const [timeline, packet] = await Promise.all([
        apiKey && proofId && reads ? timelineOfReads(apiKey, proofId, reads, door.record, fetch) : Promise.resolve(null),
        // A bought record's packet, read with the purchase's own key.
        proofId && purchase?.packet_url ? readDisputePacket(proofId, purchase.packet_url) : Promise.resolve(null),
      ]);
      return {
        record: door.record,
        door: {
          offerLine: door.offerLine,
          pending: door.pending,
          paidPendingRecord: door.paidPendingRecord,
          resumeUrl: door.resumeUrl,
          downloadable: door.downloadable,
          inHistory: door.inHistory,
          purchase,
        },
        packet,
        timeline,
      };
    } catch {
      return { record: null, door: { ...NO_DOOR, purchase: null }, packet: null, timeline: null };
    }
  };
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
      recentOrders: recentOrders.map((o) => ({
        id: o.id,
        name: o.name,
        proofId: o.proofId,
        detail: o.detail,
        more: rowRecord(o.proofId),
      })),
      // A BROWSER key, referrer-restricted to this app's hosts and to the Maps
      // JavaScript API alone — never the backend's server key (components/OpensMap.tsx).
      // The open section's maps draw with it; without it, the words remain.
      mapsKey: process.env.GOOGLE_MAPS_BROWSER_KEY || null,
    },
    { headers: { "Cache-Control": "private, no-store" } },
  );
};

// A record's inspection and its files are reads: they change nothing on this
// screen, so they do not reload it. Every download used to be followed by the
// whole Orders list reloading (6–7 s on the Steve Madden test store), its rows
// back to their placeholders under the button (2026-09-24). A purchase, and
// everything else, still reloads.
const RECORD_READS = new Set(["inspect", "pdf", "csv", "download"]);
export const shouldRevalidate: ShouldRevalidateFunction = ({ formAction, formData, defaultShouldRevalidate }) => {
  if (formAction && new URL(formAction, "https://ink.invalid").pathname === "/app/record" && RECORD_READS.has(String(formData?.get("intent") ?? "")))
    return false;
  return defaultShouldRevalidate;
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
    // Orders is wider than a Polaris page and narrower than the frame (Sam,
    // 2026-09-24: "can this be wider" · "now too wide - split the difference").
    <div style={data.section === "orders" ? { maxWidth: 1400, margin: "0 auto" } : undefined}>
    <Page
      fullWidth={data.section === "orders"}
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
            {/* The pills on top AND the admin's left nav (Sam, 2026-09-24:
                "we lost the nav on top - i want it back"). */}
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
                rows={data.includedRecords ?? data.recordHistory}
                included={Array.isArray(data.includedRecords)}
                error={data.historyError}
                hasNext={data.historyHasNext && navigation.state === "idle"}
                hasPrevious={data.historyHasPrevious && navigation.state === "idle"}
                onNext={() => goRecordPage(data.historyPage + 1)}
                onPrevious={() => goRecordPage(data.historyPage - 1)}
                mapsKey={data.mapsKey}
              />
            ) : (
              <Card padding="0">
                <Box padding="400">
                  <BlockStack gap="300">
                    <BlockStack gap="100">
                      <Text as="h2" variant="headingMd">
                        Recent orders
                      </Text>
                      <Text as="p" tone="subdued">
                        Orders from the past 60 days. Open one to review its delivery and opens.
                      </Text>
                    </BlockStack>
                    <InkOrderSearch
                      search={data.search || ""}
                      sort={data.sort || "newest"}
                      pending={navigation.state !== "idle"}
                      onChange={(search, sort) => setParams(orderSearchParams(params, search, sort))}
                    />
                  </BlockStack>
                </Box>
                {data.ordersError ? (
                  <Box paddingInline="400" paddingBlockEnd="400">
                    <Banner tone="info">
                      Orders could not be loaded. Refresh to try again.
                    </Banner>
                  </Box>
                ) : (
                  <InkRecentOrders
                    key={`${data.search}:${data.sort}:${params.get("after")}:${params.get("before")}`}
                    orders={data.recentOrders}
                    returnTo="/app/ink/orders"
                    detailed
                    advancedOpen={false}
                    recordUpFront
                    searching={Boolean(data.search)}
                    mapsKey={data.mapsKey}
                    sort={data.sort || "newest"}
                    onSort={(sort) => setParams(orderSearchParams(params, data.search || "", sort))}
                    pending={navigation.state !== "idle"}
                  />
                )}
                {data.pageInfo &&
                  (data.pageInfo.hasPreviousPage ||
                    data.pageInfo.hasNextPage) && (
                    <>
                      <Divider />
                      <Box padding="300">
                        <InlineStack align="center">
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
                        </InlineStack>
                      </Box>
                    </>
                  )}
              </Card>
            )}
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
    </div>
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
