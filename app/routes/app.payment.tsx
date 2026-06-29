import {
  type LoaderFunctionArgs,
  type ActionFunctionArgs,
  redirect,
  useLoaderData,
  Form,
} from "react-router";
import { Page, Layout, Card, Text, Button, BlockStack, List } from "@shopify/polaris";
import { authenticate } from "../shopify.server";
import { getActiveSubscriptionSummary } from "../services/billing.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  // Read the merchant's plan straight from Shopify — managed pricing owns it.
  const subscription = await getActiveSubscriptionSummary(admin).catch(() => null);
  return { subscription };
};

export const action = async ({ request }: ActionFunctionArgs) => {
  // Managed Pricing ("Shopify App Pricing") owns subscription creation — the app
  // must NOT call appSubscriptionCreate (it's rejected for managed-pricing apps,
  // which is exactly what the old charge_id="bypass" path was papering over).
  // Merchants choose/change plans through Shopify's managed-pricing UI; this
  // action just lets an authenticated merchant continue into the app.
  await authenticate.admin(request);
  return redirect("/app/dashboard");
};

export default function Payment() {
  const { subscription } = useLoaderData<typeof loader>();

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <div style={{ display: "flex", justifyContent: "center", paddingTop: "50px" }}>
            <div style={{ maxWidth: "500px", width: "100%" }}>
              <Card>
                <BlockStack gap="500">
                  <Text as="h2" variant="headingLg">
                    Your plan
                  </Text>
                  {subscription ? (
                    <Text as="p" variant="bodyMd">
                      Current plan: <b>{subscription.name}</b> ({subscription.status.toLowerCase()}).
                    </Text>
                  ) : (
                    <Text as="p" variant="bodyMd">
                      Plans are managed through Shopify — pick or change your plan from the app’s
                      pricing page in your Shopify admin.
                    </Text>
                  )}

                  <List type="bullet">
                    <List.Item>A living receipt page for every order</List.Item>
                    <List.Item>Carrier-agnostic, one-step returns</List.Item>
                    <List.Item>$2.50 per completed return (usage)</List.Item>
                  </List>

                  <Form method="post">
                    <Button submit variant="primary" size="large" fullWidth>
                      Continue to dashboard
                    </Button>
                  </Form>
                </BlockStack>
              </Card>
            </div>
          </div>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
