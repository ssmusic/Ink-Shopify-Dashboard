// INK'S ONBOARDING — one screen: the mark, "Use this", or upload.
//
// Mounted under APP_FLAVOR=ink only (server/ink-mounts.mjs). The install
// (ink-install.server.ts) has already created the merchant and asked the
// Worker to capture the brand's mark off the storefront; this screen shows
// what it found — the mark, or the shop's name set in type when there is
// none — and takes one press. There is no brand book, no Instagram, no mint:
// confirm, or upload your own, and you are done.
//
// The install runs fire-and-forget, so on the very first open the capture
// may still be in flight. The loader says which stage the record is in and
// the screen revalidates every few seconds until the capture has answered.
//
// Every visible string is PLACEHOLDER copy — Sam writes the words.

import { useEffect, useRef } from "react";
import {
  useFetcher,
  useLoaderData,
  useRevalidator,
  useRouteError,
  type ActionFunctionArgs,
  type HeadersFunction,
  type LoaderFunctionArgs,
} from "react-router";
import { boundary } from "@shopify/shopify-app-react-router/server";
import {
  Banner,
  BlockStack,
  Box,
  Button,
  Card,
  InlineStack,
  Layout,
  Link,
  Page,
  Spinner,
  Text,
} from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { captureInkMark, readShopIdentity } from "../services/ink-install.server";
import { brandNameOf, markOf, readInkMerchant, stageOf } from "../services/ink-merchant.server";
import { updateMerchant } from "../services/merchant.server";
import { dashboardDoorUrl, readRecentOrderRecords } from "../services/ink-links.server";
import { readRecordDoors, recordDoorFor } from "../services/record-charges.server";
import RecordDoor from "../components/RecordDoor";

// How long the screen keeps asking before it stops and offers "try again":
// the capture's own timeout (45s) plus the install's two backend calls.
const POLL_MS = 3_000;
const POLL_LIMIT = 25;

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const [view, recentOrders] = await Promise.all([
    readInkMerchant(session.shop),
    readRecentOrderRecords(admin),
  ]);
  // THE RECORD'S DOOR (services/record-door.server.ts): a price on the row
  // only when Sam has priced this merchant AND the kill switch is on.
  const doors = await readRecordDoors(admin, view, recentOrders.map((o) => o.proofId));
  return {
    recentOrders: recentOrders.map((o) => ({ ...o, door: recordDoorFor(doors, o.proofId) })),
    stage: stageOf(view.doc),
    mark: markOf(view),
    brandName: brandNameOf(view),
    confirmedAt: view.doc?.ink_mark_confirmed_at ?? null,
    captureNote: view.doc?.ink_mark_capture_note ?? null,
    canRecapture: Boolean(view.shopId),
  };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin, session } = await authenticate.admin(request);
  const form = await request.formData();
  const intent = String(form.get("intent") || "");

  if (intent === "use-mark") {
    // The press. Recorded on the embed's own doc; the mark itself already
    // lives on the backend doc, where the flash reads it.
    await updateMerchant(session.shop, { ink_mark_confirmed_at: new Date().toISOString() });
    return { ok: true, intent, note: null as string | null, url: null as string | null };
  }

  if (intent === "open-dashboard") {
    // The Ritualist's own door (/app/dashboard): a single-use magic token,
    // redeemed at www.in.ink/welcome. The dashboard reads the plan, so the
    // menu is ink's.
    try {
      return { ok: true, intent, note: null, url: await dashboardDoorUrl(session.shop) };
    } catch (err) {
      console.error("[ink] dashboard door failed:", err);
      return { ok: false, intent, note: "Couldn't open your dashboard. Try again in a moment.", url: null }; // PLACEHOLDER
    }
  }

  if (intent === "recapture") {
    const view = await readInkMerchant(session.shop);
    if (!view.shopId) {
      return { ok: false, intent, note: "This store is still being set up — try again in a moment.", url: null }; // PLACEHOLDER
    }
    const identity = await readShopIdentity(admin, session.shop);
    const capture = await captureInkMark({ shop: session.shop, shopId: view.shopId, siteUrl: identity.siteUrl });
    return { ok: capture.ok, intent, note: capture.note, url: null };
  }

  return { ok: false, intent, note: "Unknown action.", url: null }; // PLACEHOLDER
};

export default function InkOnboarding() {
  const data = useLoaderData<typeof loader>();
  const fetcher = useFetcher<typeof action>();
  const revalidator = useRevalidator();
  const busy = fetcher.state !== "idle";
  const waiting = data.stage !== "ready";

  // Poll while the install or the capture is still landing.
  useEffect(() => {
    if (!waiting) return;
    let polls = 0;
    const timer = setInterval(() => {
      polls += 1;
      if (polls > POLL_LIMIT) {
        clearInterval(timer);
        return;
      }
      if (revalidator.state === "idle") revalidator.revalidate();
    }, POLL_MS);
    return () => clearInterval(timer);
  }, [waiting, revalidator]);

  const confirmed = Boolean(data.confirmedAt);

  // The dashboard opens in a new tab: opened inside the click (a user gesture,
  // so no popup block), pointed at the signed-in URL when the token returns —
  // the same dance as /app/dashboard.
  const door = useFetcher<typeof action>();
  const pendingWindow = useRef<Window | null>(null);
  const openDashboard = () => {
    pendingWindow.current = window.open("", "_blank");
    door.submit({ intent: "open-dashboard" }, { method: "post" });
  };
  useEffect(() => {
    const d = door.data;
    if (!d) return;
    if (d.url) {
      if (pendingWindow.current) pendingWindow.current.location.href = d.url;
      else window.open(d.url, "_blank", "noopener,noreferrer");
    } else if (pendingWindow.current) {
      pendingWindow.current.close();
    }
    pendingWindow.current = null;
  }, [door.data]);

  return (
    // PLACEHOLDER: page title.
    <Page title="Your mark">
      <Layout>
        <Layout.Section>
          <BlockStack gap="400">
            {fetcher.data && fetcher.data.note && (
              <Banner tone={fetcher.data.ok ? "success" : "warning"}>
                {fetcher.data.note}
              </Banner>
            )}
            {door.data && door.data.note && (
              <Banner tone="warning">{door.data.note}</Banner>
            )}

            {/* THE WAY OUT — the dashboard, signed in, and each recent order's
                public record. Every string here is PLACEHOLDER copy. */}
            <Card>
              <InlineStack align="space-between" blockAlign="center" gap="400" wrap={false}>
                <BlockStack gap="100">
                  {/* PLACEHOLDER copy */}
                  <Text as="h2" variant="headingMd">Your dashboard</Text>
                  <Text as="p" tone="subdued">{"Your orders and their records. You'll be signed in automatically."}</Text>
                </BlockStack>
                {/* PLACEHOLDER label */}
                <Button variant="primary" loading={door.state !== "idle"} onClick={openDashboard}>
                  Open your dashboard
                </Button>
              </InlineStack>
            </Card>

            <Card>
              <BlockStack gap="200">
                {/* PLACEHOLDER copy */}
                <Text as="h2" variant="headingMd">Recent orders</Text>
                {data.recentOrders.length === 0 ? (
                  <Text as="p" tone="subdued">No orders yet.</Text>
                ) : (
                  <BlockStack gap="100">
                    {data.recentOrders.map((order) => (
                      <InlineStack key={order.id} align="space-between" blockAlign="center" gap="400">
                        <Text as="span">{order.name}</Text>
                        <InlineStack gap="400" blockAlign="center">
                          {order.proofId && (
                            <RecordDoor proofId={order.proofId} orderName={order.name} returnTo="/app/ink" door={order.door} />
                          )}
                          {order.recordUrl ? (
                            // PLACEHOLDER label
                            <Link url={order.recordUrl} target="_blank">View record</Link>
                          ) : (
                            // PLACEHOLDER copy
                            <Text as="span" tone="subdued">No record yet</Text>
                          )}
                        </InlineStack>
                      </InlineStack>
                    ))}
                  </BlockStack>
                )}
              </BlockStack>
            </Card>

            {waiting ? (
              <Card>
                <BlockStack gap="300" inlineAlign="center">
                  <Spinner accessibilityLabel="Looking for your mark" size="small" />
                  {/* PLACEHOLDER copy */}
                  <Text as="p" tone="subdued">
                    {data.stage === "provisioning"
                      ? "Setting up your store…"
                      : "Looking for your mark on your storefront…"}
                  </Text>
                </BlockStack>
              </Card>
            ) : (
              <Card>
                <BlockStack gap="400">
                  {/* THE MARK — or the name in type when the storefront gave none. */}
                  <Box
                    background="bg-surface-secondary"
                    padding="800"
                    borderRadius="200"
                    minHeight="160px"
                  >
                    <InlineStack align="center" blockAlign="center">
                      {data.mark ? (
                        <img
                          src={data.mark}
                          alt={`${data.brandName} mark`}
                          style={{ maxWidth: 320, maxHeight: 120, objectFit: "contain" }}
                        />
                      ) : (
                        <Text as="h2" variant="heading2xl" alignment="center">
                          {data.brandName}
                        </Text>
                      )}
                    </InlineStack>
                  </Box>

                  {/* PLACEHOLDER copy */}
                  <Text as="p" tone="subdued">
                    {data.mark
                      ? "This is the mark we found on your storefront. It's what your customers see for a moment before they're forwarded to their tracking."
                      : "We couldn't find a mark on your storefront, so your customers will see your name set in type."}
                  </Text>

                  {confirmed && (
                    // PLACEHOLDER copy
                    <Banner tone="success">You're set. Every order is being recorded.</Banner>
                  )}

                  <InlineStack gap="300">
                    <fetcher.Form method="post">
                      <input type="hidden" name="intent" value="use-mark" />
                      {/* PLACEHOLDER label */}
                      <Button submit variant="primary" loading={busy && fetcher.formData?.get("intent") === "use-mark"} disabled={busy}>
                        {confirmed ? "Keep this" : "Use this"}
                      </Button>
                    </fetcher.Form>
                    {data.canRecapture && (
                      <fetcher.Form method="post">
                        <input type="hidden" name="intent" value="recapture" />
                        {/* PLACEHOLDER label */}
                        <Button submit loading={busy && fetcher.formData?.get("intent") === "recapture"} disabled={busy}>
                          Look again
                        </Button>
                      </fetcher.Form>
                    )}
                  </InlineStack>

                  {data.captureNote && (
                    <Text as="p" variant="bodySm" tone="subdued">
                      {/* The Worker's own sentence about the last capture. */}
                      {data.captureNote}
                    </Text>
                  )}
                </BlockStack>
              </Card>
            )}

            {/* THE UPLOAD — PLACEHOLDER, DISABLED. ink holds no write_files, so
                an uploaded mark cannot go to Shopify; it goes to the Worker's
                mirror, and that door does not exist yet (the-ritualist Worker,
                a later PR). The field ships disabled so the screen's shape is
                settled and Sam sees where it goes. */}
            <Card>
              <BlockStack gap="200">
                {/* PLACEHOLDER copy */}
                <Text as="h3" variant="headingSm">Upload your own</Text>
                <Text as="p" tone="subdued">
                  Coming soon — you'll be able to drop in your own logo here. PLACEHOLDER: the upload door is not built yet.
                </Text>
                <input type="file" accept="image/png,image/svg+xml,image/jpeg,image/webp" disabled aria-label="Upload your mark (not available yet)" />
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}

// EVERY EMBEDDED ROUTE NEEDS SHOPIFY'S BOUNDARY (app.settings.tsx tells the
// story of the "200 error page"): a reauthorize throw must reach App Bridge,
// not React Router's status renderer.
export function ErrorBoundary() {
  return boundary.error(useRouteError());
}

export const headers: HeadersFunction = (args) => boundary.headers(args);
