import { type LoaderFunctionArgs } from "react-router";
import { useSubmit, Form } from "react-router";
import { Page, Layout, Card, Text, Button, BlockStack, List } from "@shopify/polaris";
import { authenticate } from "../shopify.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  await authenticate.admin(request);
  return new Response(JSON.stringify({}), {
    headers: { "Content-Type": "application/json" }
  });
};

export const action = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  const response = await admin.graphql(
    `#graphql
    mutation AppSubscriptionCreate($name: String!, $lineItems: [AppSubscriptionLineItemInput!]!, $returnUrl: URL!) {
      appSubscriptionCreate(name: $name, returnUrl: $returnUrl, lineItems: $lineItems, test: true) {
        userErrors {
          field
          message
        }
        confirmationUrl
        appSubscription {
          id
        }
      }
    }`,
    {
      variables: {
        name: "INK Verified Delivery",
        returnUrl: `${process.env.SHOPIFY_APP_URL}/app/payment/callback`,
        lineItems: [
          {
            plan: {
              appRecurringPricingDetails: {
                price: { amount: 0.10, currencyCode: "USD" }
              }
            }
          }
        ]
      },
    }
  );

  const responseJson = await response.json();
  const confirmationUrl = responseJson.data.appSubscriptionCreate.confirmationUrl;
  const userErrors = responseJson.data.appSubscriptionCreate.userErrors;

  if (userErrors.length > 0) {
    console.error("Payment Creation Errors:", userErrors);
    
    // Check for "Custom apps cannot use the Billing API" error
    const isCustomAppError = userErrors.some((err: any) => err.message.includes("Custom apps cannot use the Billing API"));
    if (isCustomAppError) {
        console.warn("Custom App credential detected. Bypassing Billing API payment.");
        // Redirect to callback with a bypass charge_id to trigger merchant registration
        const params = new URLSearchParams();
        params.append("charge_id", "bypass");
        const callbackUrl = `${process.env.SHOPIFY_APP_URL}/app/payment/callback?${params.toString()}`;
        return Response.redirect(callbackUrl);
    }
  }
  
  if (confirmationUrl) {
    return Response.redirect(confirmationUrl);
  }

  return new Response(JSON.stringify({ error: "Failed to create charge" }), {
      status: 400,
      headers: { "Content-Type": "application/json" }
  });
};

export default function Payment() {
  const submit = useSubmit();

  return (
    <Page>
      <Layout>
        <Layout.Section>
          <div style={{ display: "flex", justifyContent: "center", paddingTop: "50px" }}>
            <div style={{ maxWidth: "500px", width: "100%" }}>
              <Card>
                <BlockStack gap="500">
                  <Text as="h2" variant="headingLg">
                    Activate INK Verified Delivery
                  </Text>
                  <Text as="p" variant="bodyMd">
                    To start using INK Verified Delivery and access your dashboard, please activate your subscription.
                  </Text>
                  
                  <List type="bullet">
                    <List.Item>Automated Shipping Rates</List.Item>
                    <List.Item>NFC Tag Enrollment</List.Item>
                    <List.Item>Verified Delivery Proofs</List.Item>
                  </List>

                  <div style={{ padding: "20px", background: "#f1f1f1", borderRadius: "8px" }}>
                     <Text as="h3" variant="headingMd">Standard Plan</Text>
                     <Text as="p" variant="headingLg">₹0.10 / month</Text>
                     <Text as="p" variant="bodySm" tone="subdued">(Billed as approx $0.001 USD)</Text>
                  </div>
                  
                  <Form method="post">
                    <Button submit variant="primary" size="large" fullWidth>
                      Activate Subscription
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
