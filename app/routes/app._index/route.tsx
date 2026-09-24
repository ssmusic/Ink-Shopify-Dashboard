import { redirect, type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../../shopify.server";
import { isInk } from "../../services/app-flavor.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  // Under ink, `/app` is ink's Orders, one hop away, with the embedded params kept.
  const url = new URL(request.url);
  if (isInk()) throw redirect(`/app/ink/orders${url.search}`);
  // The Ritualist opens on its Dashboard, the first page of its nav, as ink
  // opens on its own (Sam, 2026-09-24: "make the site identical to this ...
  // nav"). The door page that stood here ("Your dashboard is ready." → "Open
  // dashboard") was one click in front of it.
  throw redirect(`/app/dashboard${url.search}`);
};

// Never drawn: the loader always sends the request on.
export default function AppIndex() {
  return null;
}
