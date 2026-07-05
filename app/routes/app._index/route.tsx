import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import { LandingPageContent } from "../../components/LandingPageContent";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return null;
};

export default function LandingPage() {
  return (
    <LandingPageContent
      ctaLink="/app/dashboard"
      ctaLabel="Open dashboard"
      showSignIn={false}
      headline="Your dashboard is ready."
      sub="A surface that opens on every Shopify order. You communicate in ink; you sign in ink — the brand half and the signature half, on every order."
      footnote="New here? Open the dashboard to set up your brand and turn on delivery notifications."
    />
  );
}
