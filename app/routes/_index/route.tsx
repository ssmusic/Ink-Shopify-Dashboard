import { redirect, type LoaderFunctionArgs } from "react-router";

// The public root of the app host. Shopify arrives with ?shop= and is sent
// into the app; anyone else sees one line. There is no form here on purpose:
// requirement 1.1 forbids asking a merchant to type a myshopify.com domain,
// and this app installs from the Shopify admin only.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  if (url.searchParams.get("shop")) throw redirect(`/app?${url.searchParams.toString()}`);
  return {};
};

// PLACEHOLDER COPY — Sam's words when he wants them. The wordmark is
// lowercase with its period by rule (parallelreturns #644).
export default function Root() {
  return (
    <main style={{ minHeight: "100vh", display: "grid", placeItems: "center", fontFamily: "system-ui, sans-serif", textAlign: "center", padding: 24 }}>
      <div>
        <p style={{ fontWeight: 700, letterSpacing: "0.08em", textTransform: "uppercase", fontSize: 13, margin: 0 }}>the ritualist.</p>
        <p style={{ marginTop: 12 }}>Every order gets its own branded page.</p>
        <p style={{ marginTop: 4 }}><a href="https://www.in.ink">in.ink</a></p>
      </div>
    </main>
  );
}
