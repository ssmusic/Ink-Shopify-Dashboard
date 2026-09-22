import { type LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { LandingPageContent } from "../../components/LandingPageContent";
import { login } from "../../shopify.server";
import { isInk } from "../../services/app-flavor.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    // ink's home is its onboarding screen; Shopify opens the app at `/`, so
    // this is the one redirect an ink install takes. The Ritualist's line is
    // unchanged.
    if (isInk()) throw redirect(`/app/ink?${url.searchParams.toString()}`);
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function Landing() {
  return <LandingPageContent ctaLink="/app" signInLink="/app" showSignIn={true} />;
}

