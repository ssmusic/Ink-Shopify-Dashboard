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

  const storeEmail = shopData?.contactEmail || "sam@in.ink";
  const installedDate = shopData?.installedDate || "Jan 15, 2024";
  const displayDomain = shopData?.primaryDomain || shopData?.shopDomain || currentShop?.domain || "music-official.myshopify.com";

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
              <InlineStack gap="200">
                <Text as="span" tone="subdued" variant="bodySm">Contact:</Text>
                <Text as="span" variant="bodySm">{storeEmail}</Text>
              </InlineStack>
              <InlineStack gap="200">
                <Text as="span" tone="subdued" variant="bodySm">Installed:</Text>
                <Text as="span" variant="bodySm">{installedDate}</Text>
              </InlineStack>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>

        <Layout.AnnotatedSection title="Usage & Billing">
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd">
                View your plan and how billing works.
              </Text>
              <div>
                <Button onClick={() => navigate("/app/billing")}>View billing</Button>
              </div>
            </BlockStack>
          </Card>
          <div style={{ marginTop: '16px' }} />
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd" fontWeight="semibold">Pricing</Text>
              <Text as="p" variant="bodyMd">
                INK is free during the pilot. Paid plans will be flat monthly
                tiers based on your order volume — billed through Shopify, no
                per-order fees.
              </Text>
            </BlockStack>
          </Card>
        </Layout.AnnotatedSection>
      </Layout>
    </BlockStack>
  );
};

export default AccountSettings;
