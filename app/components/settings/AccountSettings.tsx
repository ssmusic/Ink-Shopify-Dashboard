import { useShop } from "../../contexts/ShopContext";
import { PrivacyRequestsCard } from "../InkSettingsView";
import { useRouteLoaderData } from "react-router";
import {
  BlockStack,
  Card,
  Text,
  SkeletonBodyText,
  SkeletonDisplayText,
  InlineStack,
  Layout,
} from "@shopify/polaris";

const AccountSettings = () => {
  const { currentShop, loading } = useShop();
  
  // Dynamic data from the `app.settings` route loader
  const shopData = useRouteLoaderData("routes/app.settings") as any;

  // A ROW WE CANNOT FILL IS HIDDEN, NOT LABELLED "Not available". Printing
  // that beside a field name reads as a broken page; omitting the row reads as
  // a page with nothing to say. (The install date was un-fillable by
  // construction until the merchant record started stamping createdAt.)
  const storeEmail = shopData?.contactEmail || "";
  const installedDate = shopData?.installedDate || "";
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
        <Layout.AnnotatedSection title="Connected store">
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

        {/* Customers' privacy requests, as ink's Settings shows them. Drawn
            only when there is one, or the read failed. */}
        {(shopData?.privacy == null || shopData.privacy.length > 0) && (
          <Layout.Section>
            <PrivacyRequestsCard privacy={shopData?.privacy} action="/app/settings" />
          </Layout.Section>
        )}
      </Layout>
    </BlockStack>
  );
};

export default AccountSettings;
