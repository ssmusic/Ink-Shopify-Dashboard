import { boundary } from "@shopify/shopify-app-react-router/server";
import { useEffect, useState } from "react";
import {
  useLoaderData,
  useNavigation,
  useRevalidator,
  useRouteError,
  useSearchParams,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from "react-router";
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
  SkeletonBodyText,
  SkeletonPage,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import PolarisAppLayout from "../components/PolarisAppLayout";
import InkRecentOrders, {
  WithRecord,
  type InkOrderRow,
  type InkStreamedOrderRow,
} from "../components/InkRecentOrders";
import InkOrderSearch from "../components/InkOrderSearch";
import OrderDetailView from "../components/OrderDetailView";
import OrderExpandedRow from "../components/OrderExpandedRow";
import { readRecentOrderPage } from "../services/ink-links.server";
import { readJwks } from "../services/ink-record.server";
import { orderSearch, orderSearchParams, orderSort } from "../lib/ink-order-search";
import { ritualistApiKey, ritualistRowRecord } from "../services/ritualist-rows.server";

// SHIPMENTS IS INK'S ORDERS LEDGER (Sam, 2026-09-24: "we are making the
// ritualist as good as ink" · "it has to mirror the ritualist webapp"). The
// Ritualist's web app lists its orders on one ledger — Order · Customer ·
// Activity · Total · Ordered — whose rows open onto a quick glance and end on
// "View full order"; ink's Orders is that page in Polaris
// (components/InkRecentOrders.tsx, #152). This screen is ink's, whole:
//   · one table on thin lines — Order · Recipient · Activity · Total · Date —
//     twenty to a page, searched and sorted by Shopify, the whole row opening;
//   · a one-line state for no orders, no match and a failed read;
//   · on a phone, the stacked row, never the desktop squeezed;
//   · the opened row is ink's panel: the glance, the order's activity on the
//     honest rail, then Advanced — the record's files, its words, the last
//     open and every open on their maps, every signed event.
// What stays the Ritualist's: the record is included (its door never offers
// it, never names a price — services/ritualist-rows.server.ts); the nav is its own
// (components/PolarisAppLayout.tsx); and an opened row ends on "View full
// record", the Ritualist's full-page view, which leads to the studio.
const ORDERS_PER_PAGE = 20;

// ─────────────────────────────────────────────
// Loader
// ─────────────────────────────────────────────
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const params = new URL(request.url).searchParams;
  const search = orderSearch(params.get("q"));
  const sort = orderSort(params.get("sort"));
  const cursor = (key: string) => {
    const value = params.get(key);
    return value && value.length <= 1024 ? value : null;
  };

  // NEVER RE-THROW HERE. When a call cannot be authorised,
  // @shopify/shopify-app-react-router THROWS a Response with status 200 and
  // X-Shopify-API-Request-Failure-Reauthorize headers for App Bridge. This
  // route has a default export, so on a client-side navigation React Router
  // turbo-stream-encodes that throw as an ErrorResponse, the reauthorize
  // headers never reach App Bridge, and the page renders `error.status`: a
  // screen whose entire body is the text "200" — the App Store reviewer's
  // report on Settings (app.settings.tsx tells it whole). A failed read costs
  // the order list, said as one line, never the page.
  let ordersError = false;
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

  // EACH ROW STREAMS, as ink's Orders does (routes/app.ink.$section.tsx): the
  // list answers with Shopify's orders alone, and each row's record, its
  // activity and its door follow as that row's own promise, drawn as it lands
  // (services/ritualist-rows.server.ts) — read with the merchant's own key,
  // the published keys once for the page; the door is the Ritualist's, the
  // record included.
  const apiKey = await ritualistApiKey(session.shop);
  const keys = apiKey && page.rows.some((o) => o.proofId) ? readJwks() : null;
  const orders: InkStreamedOrderRow[] = page.rows.map((o) => ({
    id: o.id,
    name: o.name,
    proofId: o.proofId,
    detail: o.detail,
    more: ritualistRowRecord(apiKey, o.proofId, keys),
  }));

  return { orders, pageInfo: page.pageInfo, ordersError, search, sort };
};

// ─────────────────────────────────────────────
// Component
// ─────────────────────────────────────────────
export default function ShipmentsIndex() {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  const navigation = useNavigation();
  const [params, setParams] = useSearchParams();
  const [fullRecord, setFullRecord] = useState<InkOrderRow | null>(null);
  const idle = navigation.state === "idle";
  const go = (key: "after" | "before", cursor: string | null) => {
    if (!cursor) return;
    const next = new URLSearchParams(params);
    next.delete("after");
    next.delete("before");
    next.set(key, cursor);
    setParams(next);
  };

  // Auto-retry if the page loaded blank (App Bridge hydration race on first
  // open) — once a session; revalidate keeps the App Bridge session context.
  useEffect(() => {
    if (!data.orders.length && !data.ordersError && !data.search) {
      const timer = setTimeout(() => {
        const key = "ink_shipments_retried";
        if (!sessionStorage.getItem(key)) {
          sessionStorage.setItem(key, "1");
          revalidator.revalidate();
        }
      }, 1500);
      return () => clearTimeout(timer);
    }
    sessionStorage.removeItem("ink_shipments_retried");
  }, [data.orders, data.ordersError, data.search, revalidator]);

  // "View full record" — the Ritualist's full-page view of the order, which
  // leads to the studio (components/OrderDetailView.tsx). It waits on the
  // row's record side as the row does, Polaris's skeleton page until it lands.
  if (fullRecord?.detail) {
    const detail = fullRecord.detail;
    return (
      <PolarisAppLayout>
        <WithRecord
          row={fullRecord}
          fallback={
            <SkeletonPage title={detail.orderNumber} backAction>
              <Layout>
                <Layout.Section>
                  <Card>
                    <SkeletonBodyText lines={6} />
                  </Card>
                </Layout.Section>
              </Layout>
            </SkeletonPage>
          }
        >
          {(row) => <OrderDetailView order={{ ...detail, row }} onBack={() => setFullRecord(null)} />}
        </WithRecord>
      </PolarisAppLayout>
    );
  }

  return (
    <PolarisAppLayout>
      <Page
        // One name for both apps (Sam, 2026-09-24): "Orders", as ink says it.
        title="Orders"
        secondaryActions={[
          {
            content: "Refresh",
            loading: revalidator.state !== "idle",
            onAction: () => revalidator.revalidate(),
          },
        ]}
      >
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
                pending={!idle}
                onChange={(search, sort) => setParams(orderSearchParams(params, search, sort))}
              />
            </BlockStack>
          </Box>
          {data.ordersError ? (
            <Box paddingInline="400" paddingBlockEnd="400">
              <Banner tone="info">Orders could not be loaded. Refresh to try again.</Banner>
            </Box>
          ) : (
            <InkRecentOrders
              key={`${data.search}:${data.sort}:${params.get("after")}:${params.get("before")}`}
              orders={data.orders}
              searching={Boolean(data.search)}
              sort={data.sort || "newest"}
              onSort={(sort) => setParams(orderSearchParams(params, data.search || "", sort))}
              pending={!idle}
              renderPanel={(row) => <OrderExpandedRow row={row} onViewFull={() => setFullRecord(row)} />}
            />
          )}
          {data.pageInfo && (data.pageInfo.hasPreviousPage || data.pageInfo.hasNextPage) && (
            <>
              <Divider />
              <Box padding="300">
                <InlineStack align="center">
                  <Pagination
                    hasPrevious={data.pageInfo.hasPreviousPage && idle}
                    hasNext={data.pageInfo.hasNextPage && idle}
                    onPrevious={() => go("before", data.pageInfo!.startCursor)}
                    onNext={() => go("after", data.pageInfo!.endCursor)}
                    previousTooltip="Previous page"
                    nextTooltip="Next page"
                  />
                </InlineStack>
              </Box>
            </>
          )}
        </Card>
      </Page>
    </PolarisAppLayout>
  );
}

// EVERY EMBEDDED ROUTE NEEDS SHOPIFY'S BOUNDARY.
// When a session needs re-auth, @shopify/shopify-app-react-router THROWS a
// Response with status 200 carrying X-Shopify-API-Request-Failure-Reauthorize
// headers, for App Bridge to intercept. Without boundary.error(), React Router
// treats it as a route error response and renders its STATUS — a page whose
// entire body is the text "200". That is Shopify rejection 2.1.1, round two:
// "going to the billing section and navigating back ... shows an 200 error
// page". Billing had this block; /app/settings, its own backAction target, did
// not. `headers` matters too: boundary.headers forwards the reauthorize
// headers App Bridge is waiting for.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
