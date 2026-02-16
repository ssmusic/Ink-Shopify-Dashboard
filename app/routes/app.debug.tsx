import { type LoaderFunctionArgs, type ActionFunctionArgs } from "react-router";
import { useLoaderData, useFetcher } from "react-router";
import { authenticate } from "../shopify.server";
import { 
  Card, 
  Page, 
  Layout, 
  Text, 
  BlockStack, 
  Button, 
  Banner
} from "@shopify/polaris";
import { ensureCarrierServiceRegistered } from "../services/carrier-service.server";

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  
  try {
    const response = await admin.graphql(`
      query {
        carrierServices(first: 10) {
          edges {
            node {
              id
              name
              active
              callbackUrl 
            }
          }
        }
        currentAppInstallation {
          accessScopes {
            handle
          }
        }
      }
    `);
    
    const data = await response.json();
    return { 
      carrierServices: data?.data?.carrierServices?.edges || [],
      scopes: data?.data?.currentAppInstallation?.accessScopes || [],
      appUrl: process.env.SHOPIFY_APP_URL || "",
      error: null
    };
  } catch (error) {
    return { error: String(error), carrierServices: [], scopes: [], appUrl: "" };
  }
};

export const action = async ({ request }: ActionFunctionArgs) => {
  const { admin } = await authenticate.admin(request);
  const appUrl = process.env.SHOPIFY_APP_URL;

  try {
    if (!appUrl) throw new Error("SHOPIFY_APP_URL not set");
    const result = await ensureCarrierServiceRegistered(admin, appUrl);
    
    if (result && !result.success) {
      return { status: "error", message: "Registration Failed", details: result.error };
    }
    
    return { status: "success", message: "Registration Triggered Successfully", details: result?.data };
  } catch (error) {
    return { status: "error", message: String(error) };
  }
};

export default function Debug() {
  const data = useLoaderData<typeof loader>() as { carrierServices: any[], scopes: {handle: string}[], error: string | null, appUrl: string };
  const fetcher = useFetcher();

  const isRegistering = fetcher.state === "submitting";
  const actionData = fetcher.data as any;

  const hasShippingScope = data.scopes.some(s => s.handle === 'write_shipping');

  return (
    <Page title="Debug: Carrier Service">
      <Layout>
        <Layout.Section>
          <BlockStack gap="500">
            {data.error && (
              <Banner tone="critical">
                <p>Error fetching data: {data.error}</p>
              </Banner>
            )}

            {!hasShippingScope && (
               <Banner tone="critical" title="Missing Required Scope">
                 <p>The <code>write_shipping</code> scope is missing. Carrier Service usage requires this scope.</p>
                 <p>Please update your TOML config, deploy, and <strong>re-install</strong> the app on this store.</p>
               </Banner>
            )}

            {actionData && (
              <Banner tone={actionData.status === "success" ? "success" : "critical"}>
                <BlockStack gap="200">
                  <Text as="p" fontWeight="bold">{actionData.message}</Text>
                  
                  {/* Specific help for Carrier Calculated Shipping error */}
                  {JSON.stringify(actionData.details).includes("Carrier Calculated Shipping must be enabled") && (
                    <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded text-red-800 text-sm">
                      <strong>Action Required:</strong> Your store does not have "Carrier Calculated Shipping" enabled.
                      <ul className="list-disc pl-5 mt-1">
                        <li>For <strong>Development Stores</strong>: This should be enabled by default. If not, create a new dev store or contact Shopify Partner Support.</li>
                        <li>For <strong>Merchant Stores</strong>: They must be on the Shopify, Advanced, or Plus plan (or pay extra on Basic) to use this API.</li>
                      </ul>
                    </div>
                  )}

                  {actionData.details && (
                    <div className="bg-white p-2 rounded border overflow-auto">
                      <pre className="text-xs">{JSON.stringify(actionData.details, null, 2)}</pre>
                    </div>
                  )}
                </BlockStack>
              </Banner>
            )}

            <Card>
               <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Access Scopes</Text>
                <div className="flex flex-wrap gap-2">
                  {data.scopes.map(s => (
                    <span key={s.handle} className={`px-2 py-1 rounded text-xs ${s.handle === 'write_shipping' ? 'bg-green-100 text-green-800 font-bold border border-green-300' : 'bg-gray-100 text-gray-700'}`}>
                      {s.handle}
                    </span>
                  ))}
                </div>
               </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Registered Carrier Services</Text>
                <Text as="p" tone="subdued">
                  These are the carrier services currently registered on this store.
                </Text>
                
                {data.carrierServices.length === 0 ? (
                  <Banner tone="warning">No carrier services found.</Banner>
                ) : (
                  data.carrierServices.map((edge: any) => (
                    <BlockStack key={edge.node.id} gap="200">
                      <Text as="h3" variant="headingSm">{edge.node.name}</Text>
                      <div className="bg-gray-100 p-2 rounded overflow-auto max-w-full">
                        <pre className="text-xs whitespace-pre-wrap font-mono">
                          {JSON.stringify(edge.node, null, 2)}
                        </pre>
                      </div>
                    </BlockStack>
                  ))
                )}
              </BlockStack>
            </Card>

            <Card>
              <BlockStack gap="400">
                <Text as="h2" variant="headingMd">Actions</Text>
                <Text as="p">
                  Current App URL: <Text as="span" fontWeight="bold">{data.appUrl}</Text>
                </Text>
                <Button 
                  onClick={() => fetcher.submit({}, { method: "post" })}
                  loading={isRegistering}
                  variant="primary"
                >
                    Force Re-register Carrier Service
                </Button>
              </BlockStack>
            </Card>
          </BlockStack>
        </Layout.Section>
      </Layout>
    </Page>
  );
}
