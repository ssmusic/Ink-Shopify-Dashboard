import { useShop } from "../../contexts/ShopContext";
import { useNavigate, useRouteLoaderData } from "react-router";
import {
  BlockStack,
  Card,
  Text,
  SkeletonBodyText,
  SkeletonDisplayText,
  InlineStack,
  Layout,
  Button,
} from "@shopify/polaris";

const AccountSettings = () => {
  const { currentShop, loading } = useShop();
  const navigate = useNavigate();
  
  // Dynamic data from the `app.settings` route loader
  const shopData = useRouteLoaderData("routes/app.settings") as any;

  // A ROW WE CANNOT FILL IS HIDDEN, NOT LABELLED "Not available". Printing
  // that beside a field name reads as a broken page; omitting the row reads as
  // a page with nothing to say. (The install date was un-fillable by
  // construction until the merchant record started stamping createdAt.)
  const storeEmail = shopData?.contactEmail || "";
  const installedDate = shopData?.installedDate || "";
  // The plan Shopify says this store is on (app.settings loader → billing-read);
  // null = none chosen, and the card says there is no charge, which is true.
  const plan = shopData?.plan as { key: string; amount: number; ordersPerMonth: number; test?: boolean } | null | undefined;
  const displayDomain = shopData?.primaryDomain || shopData?.shopDomain || currentShop?.domain || "";

  if (loading) {
    return (
      <BlockStack gap="800">
        <Card>
          <BlockStack gap="400">
            <SkeletonDisplayText size="small" />
            <SkeletonBodyText lines={3} />
          </BlockStack>
        </Card>
      </BlockStack>
    );
  }

  return (
    <BlockStack gap="800">
      <Layout>
        <Layout.AnnotatedSection title="Connected Store">
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                {displayDomain}
              </Text>
              {storeEmail && (
              <InlineStack gap="200">
                <Text as="span" tone="subdued" variant="bodySm">Contact:</Text>
                <Text as="span" variant="bodySm">{storeEmail}</Text>
              </InlineStack>
              )}
              {installedDate && (
              <InlineStack gap="200">
                <Text as="span" tone="subdued" variant="bodySm">Installed:</Text>
                <Text as="span" variant="bodySm">{installedDate}</Text>
              </InlineStack>
              )}
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection title="Cost">
          <Card>
            <BlockStack gap="300">
              {plan ? (
                <>
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    Your plan is {plan.key} &mdash; ${plan.amount.toLocaleString("en-US")}/mo, up to {plan.ordersPerMonth.toLocaleString("en-US")} orders a month.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    Approved inside Shopify and billed on your regular Shopify invoice.
                    {plan.test ? " This is a test subscription — no money moves." : ""}
                  </Text>
                </>
              ) : (
                <>
                  <Text as="p" variant="bodyMd" fontWeight="semibold">
                    No plan chosen &mdash; there is no charge.
                  </Text>
                  <Text as="p" variant="bodyMd">
                    There is no subscription charge, trial, usage fee, or
                    off-platform invoice. Installing the app creates no charge.
                    When you choose a plan, you approve it inside Shopify &mdash;
                    nothing starts on its own.
                  </Text>
                </>
              )}
              <div>
                <Button onClick={() => navigate("/app/billing")}>View details</Button>
              </div>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>
      </Layout>
    </BlockStack>
  );
};

export default AccountSettings;
