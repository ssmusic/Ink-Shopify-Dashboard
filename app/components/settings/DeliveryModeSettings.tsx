import { useEffect, useState } from "react";
import {
  Layout,
  Card,
  BlockStack,
  RadioButton,
  Text,
  Banner,
  Spinner,
} from "@shopify/polaris";
import { toast } from "../../hooks/use-toast";

type DeliveryMode = "addon" | "background";

const DeliveryModeSettings = () => {
  const [mode, setMode] = useState<DeliveryMode>("addon");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

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
        const data = await fetchSecure("/app/api/settings/delivery-mode");
        if (data?.mode === "addon" || data?.mode === "background") {
          setMode(data.mode);
        }
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

  const handleChange = async (next: DeliveryMode) => {
    if (next === mode || saving) return;

    const previous = mode;
    setMode(next); // optimistic
    setSaving(true);

    try {
      await fetchSecure("/app/api/settings/delivery-mode", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: next }),
      });
      toast({
        description: `Delivery mode set to ${next === "addon" ? "Optional add-on" : "Automatic (background)"}`,
        duration: 2000,
      });
    } catch (err: any) {
      setMode(previous); // revert
      toast({
        title: "Couldn't save delivery mode",
        description: err.message,
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setSaving(false);
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
        title="Verified Delivery Mode"
        description="Choose how INK Verified Delivery shows up to your customers at checkout."
      >
        <Card>
          <BlockStack gap="400">
            <RadioButton
              label="Optional add-on"
              helpText="Customers see ink. Verified Delivery as a paid checkout option alongside their other shipping methods. They choose whether to opt in."
              checked={mode === "addon"}
              id="delivery-mode-addon"
              name="delivery-mode"
              onChange={() => handleChange("addon")}
              disabled={saving}
            />
            <RadioButton
              label="Automatic (background)"
              helpText="Customers see only your standard shipping methods. INK is silently applied to every order. You absorb the per-sticker cost (or price it into your products)."
              checked={mode === "background"}
              id="delivery-mode-background"
              name="delivery-mode"
              onChange={() => handleChange("background")}
              disabled={saving}
            />

            {mode === "background" && (
              <Banner tone="info">
                <Text as="p" variant="bodySm">
                  Background mode hides INK from your checkout the next time
                  Shopify polls our carrier service (usually within a few
                  minutes). Existing in-flight checkouts may still show the
                  option until then.
                </Text>
              </Banner>
            )}
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>
    </Layout>
  );
};

export default DeliveryModeSettings;
