import { type LoaderFunctionArgs } from "react-router";
import { redirect } from "@remix-run/node";
import { LandingPageContent } from "../../components/LandingPageContent";
import { login } from "../../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);

  if (url.searchParams.get("shop")) {
    throw redirect(`/app?${url.searchParams.toString()}`);
  }

  return { showForm: Boolean(login) };
};

export default function Landing() {
  return <LandingPageContent ctaLink="/app" signInLink="/app" showSignIn={true} />;
}

