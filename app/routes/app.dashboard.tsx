import { useEffect, useRef, useState } from "react";
import { useFetcher, type ActionFunctionArgs } from "react-router";
import {
  Page,
  Card,
  BlockStack,
  Text,
  Button,
  InlineStack,
  EmptyState,
  Banner,
  Layout,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { mintMagicToken } from "../services/ink-api.server";
import PolarisAppLayout from "~/components/PolarisAppLayout";
import RecentActivity from "~/components/RecentActivity";
import EngagementFunnel from "~/components/EngagementFunnel";
import NFCTagInventory from "~/components/NFCTagInventory";
import RevenueThisPeriod from "~/components/RevenueThisPeriod";
import TimeToEngagement from "~/components/TimeToEngagement";
import CurrentPlanCard from "~/components/CurrentPlanCard";
import BillingWidget from "~/components/billing/BillingWidget";
import CommunicationsUsage from "~/components/CommunicationsUsage";
import { toast } from "sonner"; // Replaced with Sonner to match previous setup

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
  const [hasOrders, setHasOrders] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);

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

  const handleViewDemo = () => {
    setIsTransitioning(true);
    toast("Loading demo data", { description: "Showing sample orders and verification data." });
    setTimeout(() => {
      setHasOrders(true);
      setIsTransitioning(false);
    }, 1000);
  };

  const handleDownloadGuide = () => {
    toast("Downloading guide", { description: "Your warehouse setup guide is being prepared." });
  };

  if (!hasOrders) {
    return (
      <PolarisAppLayout>
        <Page title="Dashboard">
          <Card>
            <EmptyState
              heading="Your setup is complete! 🎉"
              action={{ content: "View Demo", onAction: handleViewDemo, loading: isTransitioning }}
              secondaryAction={{ content: "Download Setup Guide", onAction: handleDownloadGuide }}
              image=""
            >
              <p>Your NFC tags will arrive in 3-5 business days. In the meantime, explore the app or read our warehouse setup guide.</p>
            </EmptyState>
          </Card>
        </Page>
      </PolarisAppLayout>
    );
  }

  return (
    <PolarisAppLayout>
      <Page title="Dashboard">
        <BlockStack gap="400">
          {fetcher.data?.error && (
            <Banner tone="critical">{fetcher.data.error}</Banner>
          )}

          {/* Open the merchant's ink. dashboard, auto-signed-in. */}
          <Card>
            <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
              <BlockStack gap="100">
                <Text as="h2" variant="headingMd">
                  Your ink. dashboard
                </Text>
                <Text as="p" tone="subdued">
                  Open the post-purchase surface where your enrolled orders, tap
                  pages, and returns live. You'll be signed in automatically — no
                  password needed.
                </Text>
              </BlockStack>
              <Button variant="primary" loading={opening} onClick={openParallel}>
                Open your ink. dashboard
              </Button>
            </InlineStack>
          </Card>

          {/* Operational Analytics (Metabase) */}
          <Card padding="0">
            <div style={{ padding: "0" }}>
              <iframe
                src="https://metabase-production-afb0.up.railway.app/public/dashboard/2987f9a3-e933-48d4-bb41-ad571c22c565#theme=transparent"
                frameBorder="0"
                width="100%"
                height="800"
                allowTransparency
                title="Operational Analytics Dashboard"
                style={{ display: "block" }}
              ></iframe>
            </div>
          </Card>

          {/* Row 1: Time to Engagement + Engagement Funnel */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <TimeToEngagement />
            <EngagementFunnel />
          </div>

          {/* Row 2: NFC Tag Inventory + Total Value Protected */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <NFCTagInventory />
            <RevenueThisPeriod />
          </div>

          {/* Row 3: Recent Activity + Billing Widget */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <RecentActivity />
            <div className="flex flex-col gap-4">
              <BillingWidget />
              <CurrentPlanCard />
            </div>
          </div>

          {/* Row 4: Communications — full width */}
          <CommunicationsUsage />
        </BlockStack>
      </Page>
    </PolarisAppLayout>
  );
};

export default Dashboard;
