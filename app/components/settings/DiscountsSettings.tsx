// SHOPIFY DISCOUNTS — the card that opens the door (Track C, 2026-09-04).
//
// One card on Settings › Account, beside "Connected Store" and "Cost". It
// says whether this store has allowed the Ritualist to read its discounts
// (and to create a campaign's code), and one button asks. The ask is App
// Bridge's own grant modal — `shopify.scopes.request([...])` — so nothing
// redirects and nobody but this merchant is asked; on "granted-all" the
// store's discounts are walked into the backend right away.
//
// ⚠️ Every string here is PLACEHOLDER copy (Sam's rule: "ship yours").

import { useCallback, useEffect, useState } from "react";
import { BlockStack, Button, Card, InlineStack, Layout, Text } from "@shopify/polaris";
import { toast } from "../../hooks/use-toast";

interface DiscountsState {
  granted: { read: boolean; write: boolean };
  declared: boolean;
  scopes_to_request: string[];
  backfilled_at: string | null;
  backfill_count: number | null;
  partial: boolean;
}

/** App Bridge, as the Shopify admin injects it — only the two calls this
 *  card makes. Typed here so nothing needs a ts-comment. */
interface AppBridgeScopes {
  request: (scopes: string[]) => Promise<{ result: "granted-all" | "declined-all" }>;
}
interface AppBridgeGlobal {
  idToken?: () => Promise<string>;
  scopes?: AppBridgeScopes;
}
function appBridge(): AppBridgeGlobal | undefined {
  return (window as unknown as { shopify?: AppBridgeGlobal }).shopify;
}
function messageOf(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// App-Bridge-aware fetch (the DeliveryModeSettings pattern).
async function fetchSecure(path: string, options: RequestInit = {}) {
  const appUrl = window.location.origin;
  let token = "";
  try {
    token = (await appBridge()?.idToken?.()) ?? "";
  } catch (e) {
    console.warn("Could not retrieve Shopify session token", e);
  }
  const headers = new Headers(options.headers);
  if (token) headers.set("Authorization", `Bearer ${token}`);
  if (options.body && !headers.has("Content-Type")) headers.set("Content-Type", "application/json");
  const response = await fetch(`${appUrl}${path}`, { ...options, headers });
  const contentType = response.headers.get("content-type") || "";
  const data = contentType.includes("application/json") ? await response.json() : null;
  if (!response.ok) {
    throw new Error((data && data.error) || `Error: ${response.status}`);
  }
  return data;
}

function whenLine(state: DiscountsState): string {
  if (!state.backfilled_at) return "Your discounts haven't been read in yet.";
  const when = new Date(state.backfilled_at);
  const stamp = Number.isNaN(when.getTime())
    ? ""
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(when);
  const n = state.backfill_count ?? 0;
  return `${n} discount${n === 1 ? "" : "s"} read in${stamp ? ` · ${stamp}` : ""}${state.partial ? " · more remain — press Read again" : ""}.`;
}

const DiscountsSettings = () => {
  const [state, setState] = useState<DiscountsState | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchSecure("/app/api/settings/discounts");
      setState(data);
      setFailed(null);
    } catch (err: unknown) {
      setFailed(messageOf(err, "Couldn't read the discounts setting"));
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const backfill = useCallback(async () => {
    setBusy(true);
    try {
      const r = await fetchSecure("/app/api/settings/discounts", {
        method: "POST",
        body: JSON.stringify({ action: "backfill" }),
      });
      setState(r);
      toast({
        title: "Discounts read in",
        description: `${r.nodes} discount${r.nodes === 1 ? "" : "s"} from your store${r.partial ? " — more remain, press again" : ""}.`,
      });
    } catch (err: unknown) {
      toast({ title: "Couldn't read your discounts", description: messageOf(err, "Try again in a moment."), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, []);

  const allow = useCallback(async () => {
    if (!state) return;
    setBusy(true);
    try {
      // App Bridge's scopes API, present inside the Shopify admin.
      const scopesApi = appBridge()?.scopes;
      if (!scopesApi?.request) {
        throw new Error("Open this page inside your Shopify admin to allow it.");
      }
      const response = await scopesApi.request(state.scopes_to_request);
      if (response?.result !== "granted-all") {
        toast({ title: "Not allowed", description: "No change — you can allow it any time." });
        await load();
        return;
      }
      toast({ title: "Allowed", description: "Reading your discounts in now…" });
      await backfill();
    } catch (err: unknown) {
      toast({ title: "Couldn't ask Shopify", description: messageOf(err, "Try again in a moment."), variant: "destructive" });
    } finally {
      setBusy(false);
    }
  }, [state, load, backfill]);

  const allowed = Boolean(state?.granted.read);

  return (
    <Layout.AnnotatedSection
      title="Shopify discounts"
      description="Let the Ritualist read the discounts you run, so a campaign carries your real sale — its dates, its terms, its code — and can create a campaign's code in your store."
    >
      <Card>
        <BlockStack gap="300">
          {failed ? (
            <Text as="p" tone="critical">{failed}</Text>
          ) : !state ? (
            <Text as="p" tone="subdued">Checking…</Text>
          ) : (
            <>
              <Text as="p" variant="bodyMd" fontWeight="semibold">
                {allowed
                  ? state.granted.write
                    ? "Allowed — reading and creating discounts."
                    : "Allowed — reading discounts."
                  : "Not allowed yet."}
              </Text>
              <Text as="p" tone="subdued" variant="bodySm">
                {allowed
                  ? whenLine(state)
                  : state.declared
                    ? "Shopify will ask you once, here. Nothing changes for anyone else."
                    : "This store's app version doesn't offer it yet."}
              </Text>
              <InlineStack gap="200">
                {!allowed ? (
                  <Button onClick={allow} disabled={busy || !state.declared} loading={busy}>Allow</Button>
                ) : (
                  <Button onClick={backfill} disabled={busy} loading={busy}>Read discounts again</Button>
                )}
              </InlineStack>
            </>
          )}
        </BlockStack>
      </Card>
    </Layout.AnnotatedSection>
  );
};

export default DiscountsSettings;
