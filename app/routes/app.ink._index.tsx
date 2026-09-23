import { inkDoor } from "../services/ink-billing.server";
import { useEffect, useRef, useState } from "react";
import {
  data as routeData,
  useLoaderData,
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
  Layout,
  Page,
  Pagination,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { readInkMerchant, stageOf } from "../services/ink-merchant.server";
import { readRecentOrderPage } from "../services/ink-links.server";
import { readInkKpis } from "../services/ink-kpis.server";
import InkRecentOrders from "../components/InkRecentOrders";
import InkPillNav from "../components/InkPillNav";
import DeliveryDashboard from "../components/DeliveryDashboard";
import { readTimelines } from "../services/ink-timeline.server";
import { readDeliveryDashboard } from "../services/ink-delivery.server";
import { readInkRecordHistory } from "../services/ink-record-history.server";
import InkRecordHistory from "../components/InkRecordHistory";

// While a fresh install is still provisioning (no api key yet), the doors
// cannot be read; the screen asks again every few seconds for a while.
const POLL_MS = 3_000;
const POLL_LIMIT = 25;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const params = new URL(request.url).searchParams;
  const requestedSection = params.get("view");
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
    const recordHistory = history
      ? await Promise.all(history.rows.map(async (row) => {
          const door = await inkDoor(admin, session.shop, apiKey, row.proofId).catch(() => null);
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
      },
      { headers: { "Cache-Control": "private, no-store" } },
    );
  }

  let ordersError = false;
  const cursor = (key: string) => {
    const value = params.get(key);
    return value && value.length <= 1024 ? value : null;
  };
  const page = await readRecentOrderPage(admin, {
    after: cursor("after"),
    before: cursor("before"),
  }).catch(() => {
    ordersError = true;
    return { rows: [], pageInfo: null };
  });
  const recentOrders = page.rows;
  const doors = await Promise.all(
    recentOrders.map((o) =>
      inkDoor(admin, session.shop, apiKey, o.proofId).catch(() => ({
        record: null,
        offerLine: null,
        pending: false,
        paidPendingRecord: false,
        resumeUrl: null,
        downloadable: false,
      })),
    ),
  );
  const records = Object.fromEntries(
    recentOrders.flatMap((o, i) =>
      o.proofId && doors[i].record ? [[o.proofId, doors[i].record!]] : [],
    ),
  );
  const timelines = await readTimelines(
    apiKey,
    recentOrders.map((o) => o.proofId),
    fetch,
    records,
  );
  return routeData(
    {
      section,
      stage,
      kpis: null,
      delivery: null,
      ordersError,
      pageInfo: page.pageInfo,
      recentOrders: recentOrders.map((o, i) => ({
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
        },
        timeline: o.proofId ? (timelines[o.proofId] ?? null) : null,
      })),
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
      title={data.section === "insights" ? "Dashboard" : data.section === "records" ? "Records" : "Orders"}
      secondaryActions={[
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

            {data.section === "insights" ? (
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
              <Card padding="0">
                <Box padding="400">
                  <BlockStack gap="200">
                    <Text as="h2" variant="headingMd">
                      Recent orders
                    </Text>
                    <Text as="p" tone="subdued">
                      Shopify makes orders from the past 60 days available here.
                    </Text>
                    <Text as="p" tone="subdued">
                      Open an order for its details, delivery activity, and recorded opens. Advanced shows the record summary. A downloadable record is a separate purchase when offered.
                    </Text>
                  </BlockStack>
                </Box>
                {data.ordersError ? (
                  <Banner tone="info">
                    Orders could not be loaded. Refresh to try again.
                  </Banner>
                ) : (
                  <InkRecentOrders orders={data.recentOrders} returnTo="/app/ink" />
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
                        previousTooltip="Newer orders"
                        nextTooltip="Older orders"
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
