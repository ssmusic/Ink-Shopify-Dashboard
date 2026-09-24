import { redirect, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import { LandingPageContent } from "../../components/LandingPageContent";
import { isInk } from "../../services/app-flavor.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  // Under ink this landing (the Ritualist's dashboard door) does not exist:
  // `/app` is ink's onboarding, one hop away, with the embedded params kept.
  if (isInk()) {
    const url = new URL(request.url);
    throw redirect(`/app/ink/orders${url.search}`);
  }
  return null;
};

export default function LandingPage() {
  return (
    <LandingPageContent
      ctaLink="/app/dashboard"
      ctaLabel="Open dashboard"
      showSignIn={false}
      headline="Your dashboard is ready."
      sub="Every order gets its own branded page — live tracking, delivery notifications, and returns, opened the moment it ships."
      footnote="New here? Open the dashboard to set up your brand and turn on delivery notifications."
    />
  );
}
