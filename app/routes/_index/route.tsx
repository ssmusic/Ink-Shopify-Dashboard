import { type LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";
import { LandingPageContent } from "../../components/LandingPageContent";
import { login } from "../../shopify.server";
import { INK_HOME_URL, isInk } from "../../services/app-flavor.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    // ink's home is its onboarding screen; Shopify opens the app at `/`, so
    // this is the one redirect an ink install takes. The Ritualist's line is
    // unchanged.
    if (isInk()) throw redirect(`/app/ink?${url.searchParams.toString()}`);
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  // ink's App URL opened with no store (a reviewer or a merchant typing
  // install.in.ink): the landing below is the Ritualist's ("the ritualist.",
  // "a page you own") and says nothing true about ink — send them to ink's
  // own page instead (App Store review, 2026-09-23).
  if (isInk()) throw redirect(INK_HOME_URL);

  return { showForm: Boolean(login) };
};

// The Ritualist's workspace is signed into at in.ink. Outside Shopify's admin
// there is nothing at /app to open: until 2026-09-24 both buttons here led to
// it and met the library's App Bridge bounce, a page reading "200".
const RITUALIST_SIGN_IN_URL = "https://www.in.ink/login";

export default function Landing() {
  return (
    <LandingPageContent
      ctaLink={RITUALIST_SIGN_IN_URL}
      signInLink={RITUALIST_SIGN_IN_URL}
      showSignIn={true}
    />
  );
}

