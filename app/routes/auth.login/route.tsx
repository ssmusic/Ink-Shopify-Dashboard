import type { ActionFunctionArgs, LoaderFunctionArgs } from "react-router";
import { redirect } from "react-router";

import { login } from "../../shopify.server";
import { INK_HOME_URL, isInk } from "../../services/app-flavor.server";

// Neither app's page ever asks for a shop domain (App Store requirement 2.3.1:
// install only from Shopify's own surfaces). With a `?shop=` the library can
// name, `login` throws Shopify's install/OAuth redirect as before. Every other
// visitor goes to the app's own front door — ink's page under ink (whose
// button leads to the listing), the Ritualist's landing ("/") otherwise:
// no `?shop=`, and a `?shop=` the library cannot name, for which `login`
// RETURNS an error instead of redirecting. So this route renders nothing.
// Until 2026-09-24 it rendered the template's "Shop domain" form: for the
// Ritualist with no store, and in both apps for a malformed one
// (`/auth/login?shop=not*a*shop` — the Shopify plugin's self-review).
const frontDoor = () => (isInk() ? INK_HOME_URL : "/");

async function shopifyOrFrontDoor(request: Request): Promise<never> {
  // Only the address's `?shop=` is read, never a posted form's typed-in shop.
  if (new URL(request.url).searchParams.get("shop")) await login(request);
  throw redirect(frontDoor());
}

export const loader = ({ request }: LoaderFunctionArgs) => shopifyOrFrontDoor(request);

export const action = ({ request }: ActionFunctionArgs) => shopifyOrFrontDoor(request);
