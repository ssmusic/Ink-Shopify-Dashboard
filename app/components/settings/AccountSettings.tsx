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

  const storeEmail = shopData?.contactEmail || "Not available";
  const installedDate = shopData?.installedDate || "Not available";
  const displayDomain = shopData?.primaryDomain || shopData?.shopDomain || currentShop?.domain || "Not available";

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

        <Layout.AnnotatedSection title="Cost">
          <Card>
            <BlockStack gap="300">
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                You&rsquo;re a founding merchant.
              </Text>
              <Text as="p" variant="bodyMd">
                The Ritualist is free while we build it with a small group of
                brands. If we introduce paid plans later, you&rsquo;ll choose
                and approve one inside Shopify &mdash; nothing will ever start
                on its own.
              </Text>
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
