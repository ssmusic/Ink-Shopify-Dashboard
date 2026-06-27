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

// The tap page's master state — Live (default) vs Lock the tap page. This is a
// tap-PAGE state, not a Media setting, so it lives in its own Settings tab
// rather than under Media. When locked, each customer's receipt freezes to the
// tap page they saw on their FIRST tap (the INK backend snapshots it
// server-side); the merchant keeps editing the live page for new customers.
// Default Live → receipts render live. Persisted to merchants.lock_tap_screen
// via /app/api/settings/lock-tap-screen (route unchanged). Mirrors the
// load/save + optimistic pattern of DeliveryModeSettings.
const TapPageSettings = () => {
  const [locked, setLocked] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // App-Bridge-aware fetch (mirrors the pattern used in DeliveryModeSettings).
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
        const data = await fetchSecure("/app/api/settings/lock-tap-screen");
        if (data && typeof data.lock_tap_screen === "boolean") {
          setLocked(data.lock_tap_screen);
        }
      } catch (err: any) {
        console.error("Failed to load lock-tap-screen setting:", err);
        toast({
          title: "Couldn't load tap page state",
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

  const handleChange = async (next: boolean) => {
    if (next === locked || saving) return;

    const previous = locked;
    setLocked(next); // optimistic
    setSaving(true);

    try {
      await fetchSecure("/app/api/settings/lock-tap-screen", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ lock_tap_screen: next }),
      });
      toast({
        description: next ? "Tap page locked" : "Tap page set to live",
        duration: 2000,
      });
    } catch (err: any) {
      setLocked(previous); // revert
      toast({
        title: "Couldn't save tap page state",
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
              <Spinner accessibilityLabel="Loading tap page state" size="small" />
              <Text as="p" tone="subdued" variant="bodySm">
                Loading tap page state…
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
        title="Tap Page"
        description="Control how each customer's receipt behaves after they tap."
      >
        <Card>
          <BlockStack gap="400">
            <RadioButton
              label="Live"
              helpText="Every customer's receipt renders your live tap page. Edits you make flow through to everyone — the default."
              checked={!locked}
              id="tap-page-live"
              name="tap-page-state"
              onChange={() => handleChange(false)}
              disabled={saving}
            />
            <RadioButton
              label="Lock the tap page"
              helpText="Freeze each customer's receipt to the tap page they saw on their first tap. You can keep editing the live page — new customers see your latest version, but receipts already opened stay as they were."
              checked={locked}
              id="tap-page-lock"
              name="tap-page-state"
              onChange={() => handleChange(true)}
              disabled={saving}
            />

            {locked && (
              <Banner tone="info">
                <Text as="p" variant="bodySm">
                  New receipts are frozen to the page each customer first saw.
                  New customers still get your live edits.
                </Text>
              </Banner>
            )}
          </BlockStack>
        </Card>
      </Layout.AnnotatedSection>
    </Layout>
  );
};

export default TapPageSettings;
