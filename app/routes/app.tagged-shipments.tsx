import { redirect, type LoaderFunctionArgs } from "react-router";

// This page folded into Home. Anything still linking here — a bookmark, the
// review's written steps, an old email — lands on /app with its embedded
// params intact. Resource route (no component), so a redirect Response is
// exactly right; see app/contracts/route-contracts.test.ts.
export const loader = async ({ request }: LoaderFunctionArgs) => {
  const url = new URL(request.url);
  throw redirect(`/app${url.search}`);
};
