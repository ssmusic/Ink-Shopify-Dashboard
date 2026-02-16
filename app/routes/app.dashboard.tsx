import { useState } from "react";
import AppLayout from "~/components/AppLayout";
import RecentActivity from "~/components/RecentActivity";
import EngagementFunnel from "~/components/EngagementFunnel";
import NFCTagInventory from "~/components/NFCTagInventory";
import RevenueThisPeriod from "~/components/RevenueThisPeriod";
import TimeToEngagement from "~/components/TimeToEngagement";
import CurrentPlanCard from "~/components/CurrentPlanCard";
import CommunicationsUsage from "~/components/CommunicationsUsage";
import { Button } from "~/components/ui/button";
import { toast } from "~/hooks/use-toast";
import { LiveRegion } from "~/components/ui/live-region";
import { type LoaderFunctionArgs, type HeadersFunction, useRouteError } from "react-router";
import { authenticate } from "../shopify.server";
import { boundary } from "@shopify/shopify-app-react-router/server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

const Dashboard = () => {
  // In production, this would come from API/context
  const [hasOrders, setHasOrders] = useState(true);
  const [isTransitioning, setIsTransitioning] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const handleViewDemo = () => {
    setIsTransitioning(true);
    setAnnouncement("Loading demo data...");
    toast({
      title: "Loading demo data",
      description: "Showing sample orders and verification data.",
    });
    setTimeout(() => {
      setHasOrders(true);
      setIsTransitioning(false);
      setAnnouncement("Demo data loaded. Showing 52 total orders.");
    }, 1000);
  };

  const handleDownloadGuide = () => {
    setAnnouncement("Downloading warehouse setup guide...");
    toast({
      title: "Downloading guide",
      description: "Your warehouse setup guide is being prepared.",
    });
  };

  // Empty state when no orders
  if (!hasOrders) {
    return (
      <AppLayout pageTitle="Dashboard">
        <LiveRegion message={announcement} />
        <div
          className={`flex items-center justify-center min-h-[60vh] transition-opacity duration-300 ${
            isTransitioning ? "opacity-0" : "opacity-100"
          }`}
          role="region"
          aria-label="Setup complete"
        >
          <div className="bg-card border border-border rounded-lg p-16 text-center max-w-lg w-full animate-fade-in">
            {/* Emoji */}
            <div className="text-6xl mb-6" role="img" aria-label="Celebration">
              🎉
            </div>

            {/* Heading */}
            <h1 className="text-2xl font-light text-foreground mb-4">
              Your setup is complete!
            </h1>

            {/* Description */}
            <p className="text-muted-foreground mb-8 leading-relaxed">
              Your NFC tags will arrive in 3-5 business days.
              <br />
              In the meantime, explore the app or read our warehouse setup guide.
            </p>

            {/* Buttons */}
            <div className="flex items-center justify-center gap-4">
              <Button variant="outline" onClick={handleDownloadGuide}>
                Download Setup Guide
              </Button>
              <Button
                onClick={handleViewDemo}
                className="bg-foreground text-background hover:bg-foreground/90"
              >
                View Demo
              </Button>
            </div>
          </div>
        </div>
      </AppLayout>
    );
  }

  // Normal dashboard with orders
  return (
    <AppLayout pageTitle="Dashboard">
      <LiveRegion message={announcement} />
      
      <div className={`space-y-6 animate-fade-in ${isTransitioning ? "opacity-0" : "opacity-100"}`}>
        {/* Widgets - Stacked vertically as requested */}
        <div className="space-y-6">
          <TimeToEngagement />
          <EngagementFunnel />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <NFCTagInventory />
          <RevenueThisPeriod />
        </div>

        {/* Recent Activity */}
        <RecentActivity />

        {/* Account Overview Section */}
        <CurrentPlanCard />

        {/* Communications Usage Section */}
        <CommunicationsUsage />
      </div>
    </AppLayout>
  );
};

export default Dashboard;

export const headers: HeadersFunction = (args) => boundary.headers(args);
export const ErrorBoundary = () => {
  return boundary.error(useRouteError());
};
