import { useEffect } from "react";
import { Link, useFetcher } from "react-router";
import { Card, BlockStack, InlineStack, Text, Button, Badge } from "@shopify/polaris";
import { Check } from "lucide-react";
import type { OnboardingStatus } from "../routes/app.api.onboarding.status";
import BrandPreviewCard from "./BrandPreviewCard";

// First-run setup, in-admin. Every step's done-state is REAL (from
// /app/api/onboarding/status). When all steps are complete the whole card
// self-hides — no permanent nag. This is also what makes the app clearly
// "operational through a UI on install" for App Store review.

type Step = {
  key: string;
  title: string;
  done: boolean;
  body: string;
  cta?: { label: string; to?: string; onOpenStudio?: boolean };
};

const OnboardingChecklist = ({
  onOpenStudio,
  studioOpening,
}: {
  onOpenStudio: () => void;
  studioOpening: boolean;
}) => {
  const fetcher = useFetcher<OnboardingStatus>();
  useEffect(() => {
    if (fetcher.state === "idle" && !fetcher.data) {
      fetcher.load("/app/api/onboarding/status");
    }
  }, [fetcher]);

  const s = fetcher.data;
  if (!s) return null; // silent until we know the real state (no flicker of a fake checklist)

  const steps: Step[] = [
    {
      key: "brand",
      title: "Build your page",
      done: s.brandBuilt,
      body: s.brandBuilt
        ? "Your branded page is live — every order opens on it."
        : "Open the studio and enter your website — your page builds itself from your brand in about a minute.",
      cta: s.brandBuilt ? undefined : { label: "Open studio to build", onOpenStudio: true },
    },
    {
      key: "notifications",
      title: "Turn on delivery notifications",
      done: s.notificationsOn,
      body: s.notificationsOn
        ? "Shipping and delivery updates send in your brand's name."
        : "Let buyers know when their order ships and arrives — sent as you, by email or text.",
      cta: s.notificationsOn ? undefined : { label: "Open Settings", to: "/app/settings" },
    },
    {
      key: "firstorder",
      title: "See it on a real order",
      done: s.ordersEnrolled > 0,
      body:
        s.ordersEnrolled > 0
          ? `${s.ordersEnrolled} order${s.ordersEnrolled === 1 ? "" : "s"} enrolled${
              s.deliveries > 0 ? ` · ${s.deliveries} delivered` : ""
            }${s.opens > 0 ? ` · ${s.opens} opened` : ""}.`
          : "New orders enroll automatically. Place a test order, or wait for your next real one.",
      cta: s.ordersEnrolled > 0 ? { label: "View orders", to: "/app/tagged-shipments" } : undefined,
    },
  ];

  const doneCount = steps.filter((x) => x.done).length;
  if (doneCount === steps.length) return null; // fully set up → disappear

  return (
    <Card>
      <BlockStack gap="400">
        <InlineStack align="space-between" blockAlign="center" wrap={false} gap="400">
          <BlockStack gap="100">
            <Text as="h2" variant="headingMd">
              Set up INK
            </Text>
            <Text as="p" tone="subdued">
              {doneCount} of {steps.length} done
            </Text>
          </BlockStack>
          <Badge tone={doneCount === 0 ? "attention" : "info"}>
            {`${doneCount}/${steps.length}`}
          </Badge>
        </InlineStack>

        <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-6">
          {/* Steps */}
          <BlockStack gap="300">
            {steps.map((step) => (
              <div
                key={step.key}
                className="flex items-start gap-3 rounded-md border border-border p-3"
              >
                <div
                  className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                    step.done ? "bg-foreground text-background" : "border border-border"
                  }`}
                >
                  {step.done && <Check className="h-3 w-3" />}
                </div>
                <div className="flex-1">
                  <Text as="p" variant="bodyMd" fontWeight="medium">
                    {step.title}
                  </Text>
                  <Text as="p" variant="bodySm" tone="subdued">
                    {step.body}
                  </Text>
                  {step.cta && !step.done && (
                    <div className="mt-2">
                      {step.cta.onOpenStudio ? (
                        <Button size="slim" onClick={onOpenStudio} loading={studioOpening}>
                          {step.cta.label}
                        </Button>
                      ) : step.cta.to ? (
                        <Link to={step.cta.to}>
                          <Button size="slim">{step.cta.label}</Button>
                        </Link>
                      ) : null}
                    </div>
                  )}
                </div>
              </div>
            ))}
          </BlockStack>

          {/* Live brand preview — the wow */}
          <div className="w-full md:w-56">
            <BrandPreviewCard brand={s.brand} previewUrl={s.previewUrl} built={s.brandBuilt} />
          </div>
        </div>
      </BlockStack>
    </Card>
  );
};

export default OnboardingChecklist;
