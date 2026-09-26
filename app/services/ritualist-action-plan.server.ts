// Actions run independently of the app layout loader. A page opened while a
// plan was active must not keep minting Studio sign-ins or downloading the
// included record after the plan ends. Ask Shopify again at the operation;
// an old backend plan/install stamp is not subscription approval.
export const RITUALIST_ACTION_PLAN_QUERY = `#graphql
  query RitualistActionPlan {
    currentAppInstallation { activeSubscriptions { status } }
  }
`;

type AdminGraphql = {
  graphql: (query: string) => Promise<{ json: () => Promise<unknown> }>;
};

export const ACTION_PLAN_REQUIRED = "Choose a plan in Billing to continue.";
export const ACTION_PLAN_UNAVAILABLE = "Your plan could not be checked with Shopify. Try again.";

/** Null permits this operation. Unknown billing state refuses the operation
 *  without saying that the merchant has no plan. ACTIVE includes approved
 *  trials and development-store test subscriptions, regardless of price. */
export async function ritualistActionPlanError(admin: AdminGraphql): Promise<string | null> {
  try {
    const response = await admin.graphql(RITUALIST_ACTION_PLAN_QUERY);
    const body = await response.json() as {
      errors?: unknown;
      data?: { currentAppInstallation?: { activeSubscriptions?: unknown } };
    } | null;
    const subscriptions = body?.data?.currentAppInstallation?.activeSubscriptions;
    if (body?.errors || !Array.isArray(subscriptions)) return ACTION_PLAN_UNAVAILABLE;
    if (subscriptions.some((subscription) => subscription?.status === "ACTIVE")) return null;
    if (subscriptions.some((subscription) => typeof subscription?.status !== "string")) return ACTION_PLAN_UNAVAILABLE;
    return ACTION_PLAN_REQUIRED;
  } catch {
    return ACTION_PLAN_UNAVAILABLE;
  }
}
