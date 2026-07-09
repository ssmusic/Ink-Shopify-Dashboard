import { useEffect, useState } from "react";
import {
  Layout,
  Card,
  BlockStack,
  Text,
  Banner,
  Spinner,
} from "@shopify/polaris";
import { toast } from "../../hooks/use-toast";

const DeliveryModeSettings = () => {
  const [loading, setLoading] = useState(true);

  // App-Bridge-aware fetch (mirrors the pattern used in BrandingSettings).
  const fetchSecure = async (path: string, options: RequestInit = {}) => {
    const appUrl = window.location.origin;

    let token = "";
    try {
      // @ts-ignore
      token = await window.shopify?.idToken();
    } catch (e) {
      console.warn("Could not retrieve Shopify session token", e);
    }
    if (!token && localStorage.getItem("token")) {
      token = localStorage.getItem("token") || "";
    }

    const headers = new Headers(options.headers);
    if (token) headers.set("Authorization", `Bearer ${token}`);

    const response = await fetch(`${appUrl}${path}`, { ...options, headers });
    const contentType = response.headers.get("content-type") || "";

    if (!response.ok) {
      let errMessage = `Error: ${response.status}`;
      if (contentType.includes("application/json")) {
        const errData = await response.json();
        errMessage = errData.error || errMessage;
      }
      throw new Error(errMessage);
    }

    if (contentType.includes("application/json")) return response.json();
    return null;
  };

  useEffect(() => {
    const load = async () => {
      try {
        await fetchSecure("/app/api/settings/delivery-mode");
      } catch (err: any) {
        console.error("Failed to load delivery mode:", err);
        toast({
          title: "Couldn't load delivery mode",
          description: err.message,
          variant: "destructive",
          duration: 3000,
        });
      } finally {
        setLoading(false);
      }
    };
    load();
  }, []);

  if (loading) {
    return (
      <Layout>
        <Layout.Section>
          <Card>
            <BlockStack gap="200" inlineAlign="center">
              <Spinner accessibilityLabel="Loading delivery mode" size="small" />
              <Text as="p" tone="subdued" variant="bodySm">
                Loading delivery mode…
              </Text>
            </BlockStack>
          </Card>
        </Layout.Section>
      </Layout>
    );
  }

  return (
    <Layout>
      <Layout.AnnotatedSection
        title="Delivery mode"
        description="ink. works behind your existing Shopify delivery methods."
      >
        <Card>
          <BlockStack gap="400">
            <Text as="p" variant="bodyMd">
              Automatic background mode is active. Buyers see only your standard
              Shopify shipping methods, and ink. creates order pages for
              eligible orders after purchase.
            </Text>
            <Banner tone="info">
              <Text as="p" variant="bodySm">
                INK does not add a customer-paid checkout delivery option. Any
                legacy carrier-service callback returns no rates while the app
                runs in background mode.
              </Text>
            </Banner>
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>
    </Layout>
  );
};

export default DeliveryModeSettings;
