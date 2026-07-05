import { useEffect, useRef, useState } from "react";
import { useFetcher, type ActionFunctionArgs } from "react-router";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  Banner,
  Collapsible,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { mintMagicToken } from "../services/ink-api.server";
import PolarisAppLayout from "~/components/PolarisAppLayout";
import RecentActivity from "~/components/RecentActivity";
import EngagementFunnel from "~/components/EngagementFunnel";
// NFC hardware lane — tabled behind FEATURE_NFC (see app/flags.ts), never deleted.
import NFCTagInventory from "~/components/NFCTagInventory";
import RevenueThisPeriod from "~/components/RevenueThisPeriod";
import PlanCard from "~/components/billing/PlanCard";
import CommsCard from "~/components/CommsCard";
import OnboardingChecklist from "~/components/OnboardingChecklist";
import AdvancedAnalytics from "~/components/AdvancedAnalytics";
import { FEATURE_NFC } from "~/flags";
// Removed from render (kept in tree, unreferenced): TimeToEngagement +
// CommunicationsUsage rendered hardcoded fictional numbers; BillingWidget +
// CurrentPlanCard priced real counts at fictional NFC-era rates. Nothing on
// this dashboard may show a number that isn't the merchant's own.

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
      error: "Couldn't open your ink. dashboard. Try again in a moment.",
    };
  }
};

const Dashboard = () => {
  // The full operational-analytics BI lives in the standalone ink. dashboard;
  // here it's tucked behind an Advanced disclosure (collapsed by default) so the
  // embed leads with the lightweight engagement cards + handoff, not a second
  // comprehensive dashboard to keep in sync.
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
      <Page title="Dashboard">
        <BlockStack gap="400">
          {fetcher.data?.error && (
            <Banner tone="critical">{fetcher.data.error}</Banner>
          )}

          {/* First-run setup — self-hides once complete (real state). */}
          <OnboardingChecklist onOpenStudio={openParallel} studioOpening={opening} />

          {/* Open the merchant's ink. dashboard, auto-signed-in. */}
          <Card>
            <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Your ink. dashboard
                </Text>
                <Text as="p" tone="subdued">
                  Open the INK studio — where your enrolled orders, pages,
                  and returns live. You'll be signed in automatically — no
                  password needed.
                </Text>
              </BlockStack>
              <Button variant="primary" loading={opening} onClick={openParallel}>
                Open your ink. dashboard
              </Button>
            </InlineStack>
          </Card>

          {/* Row 1: Open funnel + Enrolled Order Value — real numbers only.
              The funnel ends with the pull to the in.ink studio (full insights). */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <EngagementFunnel onOpenStudio={openParallel} studioOpening={opening} />
            <RevenueThisPeriod />
          </div>

          {/* NFC hardware lane — tabled behind the flag, not deleted */}
          {FEATURE_NFC && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <NFCTagInventory />
            </div>
          )}

          {/* Row 2: Recent Activity + comms state + the honest plan card */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RecentActivity />
            <div className="flex flex-col gap-4">
              <CommsCard />
              <PlanCard />
            </div>
          </div>

          {/* Advanced — the full operational-analytics BI, collapsed by default.
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
                    Detailed operational metrics. The full ink. dashboard lives
                    in your ink. app.
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
