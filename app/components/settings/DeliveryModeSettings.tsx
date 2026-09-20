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

const DeliveryModeSettings = ({ shopName }: { shopName?: string }) => {
  const [loading, setLoading] = useState(true);
  // The branded tracking link. ON for every merchant unless they turn it off
  // here — so this starts true and only a loaded `false` moves it.
  const [trackingLink, setTrackingLink] = useState(true);
  // Shopify's own shipping email, carrying the page. ON by default, same as
  // the tracking link — Sam's ruling of 2026-09-05 is the default.
  const [shopifyShippingEmail, setShopifyShippingEmail] = useState(true);
  // The brand's own email. OFF by default: a second email to someone else's
  // customer is the merchant's call, not ours.
  const [brandPageEmail, setBrandPageEmail] = useState(false);
  const [trackingLinkSaving, setTrackingLinkSaving] = useState(false);
  const brand = (shopName || "your brand").trim() || "your brand";

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
        if (res && typeof res.shopifyShippingEmail === "boolean") {
          setShopifyShippingEmail(res.shopifyShippingEmail);
        }
        if (res && typeof res.brandPageEmail === "boolean") setBrandPageEmail(res.brandPageEmail);
      } catch (err: any) {
        console.error("Failed to load tracking link setting:", err);
      }
      setLoading(false);
    };
    load();
  }, []);

  // ONE saver for the three switches on this card. Each one moves optimistically
  // and is put back if the save fails — a toggle that keeps a lie on screen is
  // worse than one that lags.
  const saveSwitch = async (
    field: "enabled" | "shopifyShippingEmail" | "brandPageEmail",
    value: boolean,
    apply: (v: boolean) => void,
    previous: boolean,
    message: string,
  ) => {
    apply(value);
    setTrackingLinkSaving(true);
    try {
      await fetchSecure("/app/api/settings/branded-tracking-link", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ [field]: value }),
      });
      toast({ title: message, duration: 2500 });
    } catch (err: any) {
      apply(previous); // say so, don't keep a lie on screen
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

  const saveTrackingLink = (enabled: boolean) =>
    saveSwitch(
      "enabled",
      enabled,
      setTrackingLink,
      trackingLink,
      enabled ? "Tracking links point to your page" : "Tracking links point to the carrier",
    );

  const saveShopifyShippingEmail = (on: boolean) =>
    saveSwitch(
      "shopifyShippingEmail",
      on,
      setShopifyShippingEmail,
      shopifyShippingEmail,
      on ? "Shopify's shipping email will carry your page" : "Shopify's shipping email is left alone",
    );

  const saveBrandPageEmail = (on: boolean) =>
    saveSwitch(
      "brandPageEmail",
      on,
      setBrandPageEmail,
      brandPageEmail,
      on ? `${brand} will email the page` : `${brand} sends no extra email`,
    );

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

            {/* PLACEHOLDER COPY — Sam writes the words. The two switches Sam
                ruled on, 2026-09-05, on the card that already owns this
                subject rather than a new one. */}
            <Checkbox
              id="ink-shopify-shipping-email"
              label="Send Shopify’s shipping email when your customer hasn’t had one"
              helpText={
                "If you fulfil an order without ticking Shopify’s own “Send shipment details”, your " +
                "customer gets no shipping email at all. This sends exactly one, from your own " +
                "template, and its tracking button opens your order page. A customer who already " +
                "had a shipping email never gets a second."
              }
              checked={shopifyShippingEmail}
              disabled={trackingLinkSaving}
              onChange={saveShopifyShippingEmail}
            />

            <Checkbox
              id="ink-brand-page-email"
              label={`Email the page from ${brand} when Shopify’s email already went out`}
              helpText={
                "When your shipping email has already gone out with the carrier’s link in it, this " +
                "sends one short email from your brand with a link to the order’s page. Off unless " +
                "you turn it on: it is a second email to your customer."
              }
              checked={brandPageEmail}
              disabled={trackingLinkSaving}
              onChange={saveBrandPageEmail}
            />
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>
    </Layout>
  );
};

export default DeliveryModeSettings;
