import { authenticate } from "../shopify.server";
import type { ActionFunctionArgs, LoaderFunctionArgs, HeadersFunction } from "react-router";
import { Form, useLoaderData, useNavigation, useRouteError } from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import { Page, BlockStack, Card, Text, Button, InlineStack, Badge } from "@shopify/polaris";
import PolarisAppLayout from "../components/PolarisAppLayout";
import PlanCard from "../components/billing/PlanCard";
import { BILLING_PLANS, BILLING_PLAN_KEYS, isBillingPlanKey, planCapLine, planPriceLine } from "../services/billing-plans";
import { BILLING_IS_TEST } from "../services/billing-mode.server";
import { readActivePlan } from "../services/billing-read.server";

// The billing page (Track C, tier billing — HELD until Shopify answers round
// four AND the listing's pricing matches these three tiers exactly).
//
// Three locked tiers, chosen here, approved on SHOPIFY'S screen: Choose →
// the action asks billing.request, which sends the merchant to Shopify's
// confirmation page (appSubscriptionCreate under the hood); approved charges
// land on the regular Shopify invoice; decline brings them back here with
// nothing started. Shopify owns approval, decline, cancellation and the
// reinstall re-approval. The active plan is READ from Shopify on every
// visit, never from our own records — no internal "paid" flag exists.
//
// Still the honest page when nothing is chosen: "there is no charge" stays
// true until a merchant approves one. Requirement 2.1.1's boundary and
// headers stay exactly as they were.

export async function loader({ request }: LoaderFunctionArgs) {
  const { billing } = await authenticate.admin(request);
  const active = await readActivePlan(billing, "[billing page]");
  return {
    active,
    isTest: BILLING_IS_TEST,
    plans: BILLING_PLAN_KEYS.map((key) => ({
      key,
      price: planPriceLine(BILLING_PLANS[key]),
      cap: planCapLine(BILLING_PLANS[key]),
    })),
  };
}

export async function action({ request }: ActionFunctionArgs) {
  const { billing } = await authenticate.admin(request);
  const form = await request.formData();
  const plan = form.get("plan");
  if (!isBillingPlanKey(plan)) {
    return { error: "Choose one of the three plans." };
  }
  const appUrl = process.env.SHOPIFY_APP_URL || "";
  // Redirects to Shopify's approval screen; the library throws the redirect.
  await billing.request({
    plan,
    isTest: BILLING_IS_TEST,
    returnUrl: `${appUrl}/app/billing`,
  });
  return { error: null };
}

export default function BillingPage() {
  const { active, isTest, plans } = useLoaderData<typeof loader>();
  const navigation = useNavigation();
  const choosing = navigation.state !== "idle" ? String(navigation.formData?.get("plan") ?? "") : "";

  return (
    <PolarisAppLayout>
      <Page
        title="Billing"
        backAction={{ content: "Settings", url: "/app/settings" }}
      >
        <BlockStack gap="400">
          <PlanCard plan={active} />
          <Card>
            <BlockStack gap="300">
              <Text as="h2" variant="headingSm">
                Plans
              </Text>
              <Text as="p" tone="subdued">
                Priced on orders, not on opens — clicks and page opens are never metered.
                Choose a plan and Shopify will ask you to approve it; the charge lands on
                your regular Shopify invoice. Nothing starts until you approve.
              </Text>
              {plans.map((p) => {
                const isActive = active?.key === p.key;
                return (
                  <InlineStack key={p.key} align="space-between" blockAlign="center" gap="400" wrap={false}>
                    <BlockStack gap="050">
                      <InlineStack gap="200" blockAlign="center">
                        <Text as="p" variant="bodyMd" fontWeight="semibold">{p.key}</Text>
                        {isActive ? <Badge tone="success">Current plan</Badge> : null}
                      </InlineStack>
                      <Text as="p" tone="subdued" variant="bodySm">{p.price} · {p.cap}</Text>
                    </BlockStack>
                    <Form method="post">
                      <input type="hidden" name="plan" value={p.key} />
                      <Button submit disabled={isActive} loading={choosing === p.key}>
                        {isActive ? "Chosen" : `Choose ${p.key}`}
                      </Button>
                    </Form>
                  </InlineStack>
                );
              })}
              {isTest ? (
                <Text as="p" tone="subdued" variant="bodySm">
                  Test mode: Shopify shows the approval screen and no money moves.
                </Text>
              ) : null}
            </BlockStack>
          </Card>
          <Card>
            <BlockStack gap="200">
              <Text as="h2" variant="headingSm">
                Billing stays in Shopify
              </Text>
              <Text as="p" tone="subdued">
                Approval, decline, invoicing and cancellation all happen inside Shopify.
                There is no card on file here, no trial, no usage fee, and no off-platform
                invoice. Returns are priced separately, on your own carrier account.
              </Text>
            </BlockStack>
          </Card>
        </BlockStack>
      </Page>
    </PolarisAppLayout>
  );
}

export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
