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
      sub="A living page for every Shopify order. Branded post-purchase, carrier-agnostic returns — opened on a tap."
      footnote="New here? Open the dashboard to set up your brand and order your first stickers."
    />
  );
}
