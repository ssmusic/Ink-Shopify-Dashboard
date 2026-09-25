import { OAuth2Client } from "google-auth-library";
import type { LoaderFunctionArgs } from "react-router";
import { processPendingPrivacy } from "../services/ink-privacy.server";

// Cloud Scheduler signs an OIDC token as the dedicated privacy-job service
// account. Check both the audience and principal; the Cloud Run service
// itself is public because Shopify must deliver webhooks.
async function authorized(request: Request) {
  const expectedEmail = process.env.PRIVACY_JOB_SERVICE_ACCOUNT;
  const audience = process.env.PRIVACY_JOB_AUDIENCE;
  const header = request.headers.get("Authorization");
  if (!expectedEmail || !audience || !header?.startsWith("Bearer ")) return false;
  try {
    const ticket = await new OAuth2Client().verifyIdToken({
      idToken: header.slice(7), audience,
    });
    const claim = ticket.getPayload();
    return claim?.email === expectedEmail;
  } catch {
    return false;
  }
}

export async function loader({ request }: LoaderFunctionArgs) {
  if (!(await authorized(request))) return new Response("Unauthorized", { status: 401 });
  try {
    const outcome = await processPendingPrivacy();
    return Response.json(outcome, { status: outcome.failed ? 503 : 200 });
  } catch {
    console.error("[ink privacy] worker unavailable");
    return new Response("Worker unavailable", { status: 503 });
  }
}
