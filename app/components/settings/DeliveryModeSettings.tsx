import { useEffect, useState } from "react";
import {
  Layout,
  Card,
  BlockStack,
  Text,
  Banner,
  Spinner,
  Checkbox,
} from "@shopify/polaris";
import { toast } from "../../hooks/use-toast";

const DeliveryModeSettings = () => {
  const [loading, setLoading] = useState(true);
  // The branded tracking link. ON for every merchant unless they turn it off
  // here — so this starts true and only a loaded `false` moves it.
  const [trackingLink, setTrackingLink] = useState(true);
  const [trackingLinkSaving, setTrackingLinkSaving] = useState(false);

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
      }
      // Separate try: a tracking-link read that fails must not blank the
      // delivery panel, and vice versa.
      try {
        const res = await fetchSecure("/app/api/settings/branded-tracking-link");
        if (res && typeof res.enabled === "boolean") setTrackingLink(res.enabled);
      } catch (err: any) {
        console.error("Failed to load tracking link setting:", err);
      }
      setLoading(false);
    };
    load();
  }, []);

  const saveTrackingLink = async (enabled: boolean) => {
    const previous = trackingLink;
    setTrackingLink(enabled); // optimistic — a toggle that lags feels broken
    setTrackingLinkSaving(true);
    try {
      await fetchSecure("/app/api/settings/branded-tracking-link", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      toast({
        title: enabled ? "Tracking links point to your page" : "Tracking links point to the carrier",
        duration: 2500,
      });
    } catch (err: any) {
      setTrackingLink(previous); // say so, don't keep a lie on screen
      toast({
        title: "Couldn't save that",
        description: err.message,
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setTrackingLinkSaving(false);
    }
  };

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
        description="The Ritualist works behind your existing Shopify delivery methods."
      >
        <Card>
          <BlockStack gap="400">
            <Text as="p" variant="bodyMd">
              Automatic background mode is active. Buyers see only your standard
              Shopify shipping methods, and the Ritualist creates order pages for
              eligible orders after purchase.
            </Text>
            <Banner tone="info">
              <Text as="p" variant="bodySm">
                The Ritualist does not add a customer-paid checkout delivery option. Any
                legacy carrier-service callback returns no rates while the app
                runs in background mode.
              </Text>
            </Banner>
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>

      <Layout.AnnotatedSection
        title="Tracking link"
        description="Where your customer lands when they click “Track your shipment”."
      >
        <Card>
          <BlockStack gap="400">
            <Checkbox
              label="Send tracking clicks to your order page"
              helpText={
                "Your order page answers when the package is arriving, and it stays yours. " +
                "The carrier name and tracking number are still shown, and still link to the carrier."
              }
              checked={trackingLink}
              disabled={trackingLinkSaving}
              onChange={saveTrackingLink}
            />
            <Text as="p" tone="subdued" variant="bodySm">
              This applies to the tracking link on the order page in your admin, in the
              shipping-confirmation email, and on your customer’s order-status page. Orders shipped
              with a carrier we can’t follow keep Shopify’s own tracking link, so no customer is
              ever sent to a page that can’t tell them anything.
            </Text>
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>
    </Layout>
  );
};

export default DeliveryModeSettings;
