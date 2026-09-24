import { boundary } from "@shopify/shopify-app-react-router/server";
import { useEffect, useRef, useState } from "react";
import {
  useFetcher,
  useLoaderData,
  useRevalidator,
  useRouteError,
  type ActionFunctionArgs,
  type HeadersFunction,
  type LoaderFunctionArgs,
  type ShouldRevalidateFunction,
} from "react-router";
import {
  Page,
  Card,
  BlockStack,
  Box,
  Text,
  Button,
  InlineGrid,
  InlineStack,
  Banner,
  Collapsible,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { mintMagicToken } from "../services/ink-api.server";
import { readInkKpis } from "../services/ink-kpis.server";
import { readDeliveryDashboard } from "../services/ink-delivery.server";
import { readRecentOrderPage } from "../services/ink-links.server";
import { readJwks } from "../services/ink-record.server";
import { ritualistApiKey, ritualistRowRecord } from "../services/ritualist-rows.server";
import PolarisAppLayout from "../components/PolarisAppLayout";
import DeliveryDashboard from "../components/DeliveryDashboard";
import InkRecentOrders, { type InkStreamedOrderRow } from "../components/InkRecentOrders";
import OrderExpandedRow from "../components/OrderExpandedRow";
// NFC hardware lane — tabled behind FEATURE_NFC (see app/flags.ts), never deleted.
import NFCTagInventory from "../components/NFCTagInventory";
import RevenueThisPeriod from "../components/RevenueThisPeriod";
import AdvancedAnalytics from "../components/AdvancedAnalytics";
import { FEATURE_NFC } from "../flags";
// Removed from render (kept in tree, unreferenced): TimeToEngagement +
// CommunicationsUsage rendered hardcoded fictional numbers. Nothing on this
// dashboard may show a number that isn't the merchant's own.
//
// THE DASHBOARD IS INK'S (Sam, 2026-09-24: "we are making the ritualist as good
// as ink" · "it has to mirror the ritualist webapp"). It leads with ink's
// Dashboard (components/DeliveryDashboard.tsx) — the merchant's own numbers
// from merchant-insights and merchant-delivery, read with the merchant's own
// key — then the last six orders on ink's ledger, as the web app's Dashboard
// ends on "The last six orders". Also removed from render, kept in tree:
//   · EngagementFunnel — four colours, and a failed read drawn as zeros; its
//     Enrolled → Delivered → Opened steps are ink's "Delivery and opens" above.
//     Its "Clicked" step (the page's click-through) is not on ink's Dashboard;
//     the studio keeps it — Orders › Insights draws Enrolled → Delivered →
//     Opened → Clicked (the-ritualist src/components/insights/
//     OrdersInsightsPanel.tsx) — one press away through the studio door.
//   · RecentActivity — Shopify's tags and a status badge; the rows are now the
//     ledger's own (routes/app.tagged-shipments._index.tsx), opening in place.
//   · OnboardingChecklist ("Set up the Ritualist", 2 of 3) and the brand preview
//     inside it, and CommsCard (Sam, 2026-09-24, on the live Dashboard: "were
//     onboarding in this app now?" · "we dont have notifacations yet" · "is dead"
//     · "this is horrifying"). Its steps claimed delivery notifications the
//     Ritualist does not send yet (nothing schedules api.jobs.notifications); a
//     done step led nowhere; the preview's "Track your order" was a picture of a
//     button, its brand read "Your brand", and its link opened a popup. The
//     Communications card said "Email notifications: On" for the same missing
//     feature. ink's Dashboard has neither card.
//   · PlanCard ("Cost — Your Shopify plan is Free."): the Ritualist is paid
//     (Sam, 2026-09-24: "get rid of that"). Billing says the plan as Shopify
//     has it (routes/app.billing.tsx).
// What stays the Ritualist's: the door to the studio, the order value of the
// last 30 days, and Advanced.
const RECENT_ORDERS = 6;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  // Every read below goes with the merchant's own key; the admin secret never
  // scopes a merchant read. A read that fails is said as unavailable, never as
  // zero — and never re-thrown (app.tagged-shipments._index.tsx tells why).
  const apiKey = await ritualistApiKey(session.shop);
  // The six rows stream as the Shipments ledger's do (services/ritualist-rows.server.ts):
  // the orders at once, each row's record as it lands — a big record never
  // holds the Dashboard.
  const recentOrders = async (): Promise<InkStreamedOrderRow[]> => {
    const page = await readRecentOrderPage(admin, {
      first: RECENT_ORDERS,
      search: "",
      sort: "newest",
    });
    const keys = apiKey && page.rows.some((o) => o.proofId) ? readJwks() : null;
    return page.rows.map((o) => ({
      id: o.id,
      name: o.name,
      proofId: o.proofId,
      detail: o.detail,
      more: ritualistRowRecord(apiKey, o.proofId, keys),
    }));
  };
  const [kpis, delivery, recent] = await Promise.all([
    readInkKpis(apiKey).catch(() => null),
    readDeliveryDashboard(apiKey).catch(() => null),
    recentOrders().catch(() => null),
  ]);
  return { kpis, delivery, recentOrders: recent };
};

// A press of the studio door (this route's action) or of a record's file
// (/app/record) changes nothing this page reads, so neither re-reads it.
// Refresh still does.
export const shouldRevalidate: ShouldRevalidateFunction = ({
  formMethod,
  defaultShouldRevalidate,
}) => (formMethod ? false : defaultShouldRevalidate);

// Mint a single-use magic-login token for this shop and hand back a
// www.in.ink/welcome URL the merchant can open already signed in.
export const action = async ({
  request,
}: ActionFunctionArgs): Promise<{ url: string | null; error: string | null }> => {
  const { session } = await authenticate.admin(request);
  try {
    const { token } = await mintMagicToken(session.shop);
    const base = process.env.PARALLEL_APP_URL || "https://www.in.ink";
    return {
      url: `${base}/welcome?token=${encodeURIComponent(token)}`,
      error: null,
    };
  } catch (err) {
    console.error("[dashboard] mint magic token failed:", err);
    return {
      url: null,
      error: "Couldn't open The Ritualist Studio. Try again in a moment.",
    };
  }
};

const Dashboard = () => {
  const data = useLoaderData<typeof loader>();
  const revalidator = useRevalidator();
  // The operational analytics ink's Dashboard does not show — the signed
  // records' integrity and the delivery outcomes — stay behind an Advanced
  // disclosure, collapsed by default.
  const [showAdvanced, setShowAdvanced] = useState(false);

  const fetcher = useFetcher<typeof action>();
  const pendingWindow = useRef<Window | null>(null);
  const opening = fetcher.state !== "idle";

  const openParallel = () => {
    // Open the new tab synchronously inside the click handler (a user gesture)
    // so the browser doesn't block it as a popup, then point it at the real
    // signed-in URL once the token comes back from the action.
    pendingWindow.current = window.open("", "_blank");
    fetcher.submit({}, { method: "post" });
  };

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if (data.url) {
      if (pendingWindow.current) {
        pendingWindow.current.location.href = data.url;
      } else {
        window.open(data.url, "_blank", "noopener,noreferrer");
      }
      pendingWindow.current = null;
    } else if (data.error && pendingWindow.current) {
      pendingWindow.current.close();
      pendingWindow.current = null;
    }
  }, [fetcher.data]);

  return (
    <PolarisAppLayout>
      <Page
        title="Dashboard"
        secondaryActions={[
          {
            content: "Refresh",
            loading: revalidator.state !== "idle",
            onAction: () => revalidator.revalidate(),
          },
        ]}
      >
        <BlockStack gap="400">
          {fetcher.data?.error && (
            <Banner tone="critical">{fetcher.data.error}</Banner>
          )}

          {/* Open the merchant's ink. dashboard, auto-signed-in. */}
          <Card>
            <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  The Ritualist Studio
                </Text>
                <Text as="p" tone="subdued">
                  Open The Ritualist Studio — where your enrolled orders, pages,
                  and returns live. You'll be signed in automatically — no
                  password needed.
                </Text>
              </BlockStack>
              <Button variant="primary" loading={opening} onClick={openParallel}>
                Open The Ritualist Studio
              </Button>
            </InlineStack>
          </Card>

          {/* ink's Dashboard, whole: the merchant's own numbers. */}
          <DeliveryDashboard kpis={data.kpis} delivery={data.delivery} />

          {/* The last six orders — the ledger, unchanged; a row opens in place. */}
          <Card padding="0">
            <Box padding="400">
              <InlineStack align="space-between" blockAlign="center" gap="400">
                <Text as="h2" variant="headingMd">
                  Recent activity
                </Text>
                <Button variant="plain" url="/app/tagged-shipments">
                  View all
                </Button>
              </InlineStack>
            </Box>
            {data.recentOrders ? (
              <InkRecentOrders
                orders={data.recentOrders}
                renderPanel={(row) => <OrderExpandedRow row={row} />}
              />
            ) : (
              <Box paddingInline="400" paddingBlockEnd="400">
                <Banner tone="info">
                  Orders could not be loaded. Refresh to try again.
                </Banner>
              </Box>
            )}
          </Card>

          {/* NFC hardware lane — tabled behind the flag, not deleted */}
          {FEATURE_NFC && (
            <InlineGrid columns={{ xs: 1, md: 2 }} gap="400">
              <NFCTagInventory />
            </InlineGrid>
          )}

          {/* The order value of the last 30 days. */}
          <RevenueThisPeriod />

          {/* Advanced — what ink's Dashboard does not show, collapsed by default.
              Relocated here (not deleted) so the embed stays lean; the rich
              dashboard is the standalone ink. app. */}
          <Card>
            <BlockStack gap="300">
              <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
                <BlockStack gap="100">
                  <Text as="h2" variant="headingMd">
                    Advanced — operational analytics
                  </Text>
                  <Text as="p" tone="subdued">
                    Detailed operational metrics. The full dashboard lives in
                    The Ritualist Studio.
                  </Text>
                </BlockStack>
                <Button
                  onClick={() => setShowAdvanced((v) => !v)}
                  ariaExpanded={showAdvanced}
                  ariaControls="advanced-analytics"
                  disclosure={showAdvanced ? "up" : "down"}
                >
                  {showAdvanced ? "Hide" : "Show"}
                </Button>
              </InlineStack>
              <Collapsible
                id="advanced-analytics"
                open={showAdvanced}
                transition={{ duration: "200ms", timingFunction: "ease-in-out" }}
              >
                {showAdvanced ? <AdvancedAnalytics /> : null}
              </Collapsible>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    </PolarisAppLayout>
  );
};

export default Dashboard;

// EVERY EMBEDDED ROUTE NEEDS SHOPIFY'S BOUNDARY.
// When a session needs re-auth, @shopify/shopify-app-react-router THROWS a
// Response with status 200 carrying X-Shopify-API-Request-Failure-Reauthorize
// headers, for App Bridge to intercept. Without boundary.error(), React Router
// treats it as a route error response and renders its STATUS — a page whose
// entire body is the text "200". That is Shopify rejection 2.1.1, round two:
// "going to the billing section and navigating back ... shows an 200 error
// page". Billing had this block; /app/settings, its own backAction target, did
// not. `headers` matters too: boundary.headers forwards the reauthorize
// headers App Bridge is waiting for. The page carries the merchant's own
// numbers, so no cache keeps it (as ink's Dashboard, app.ink._index.tsx).
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => {
  const headers = new Headers(boundary.headers(args));
  headers.set("Cache-Control", "private, no-store");
  return headers;
};
