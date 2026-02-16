/**
 * Carrier Service Registration Utility
 * 
 * Registers the app as a Carrier Service so Shopify calls our
 * /api/shipping-rates endpoint at checkout to provide shipping options.
 */

const CARRIER_SERVICE_NAME = "ink. Verified Delivery";

/**
 * Checks if our carrier service is already registered, creates it if not.
 * This is idempotent — safe to call on every app load.
 */
export async function ensureCarrierServiceRegistered(admin: any, appUrl: string) {
  try {
    // 1. Check if carrier service already exists
    const listResponse = await admin.graphql(`
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
      }
    `);

    const listData = await listResponse.json();
    const existingServices = listData?.data?.carrierServices?.edges || [];
    
    const existingInk = existingServices.find(
      (edge: any) => edge.node.name === CARRIER_SERVICE_NAME
    );

    if (existingInk) {
      // Already registered — check if callback URL needs updating
      const currentCallbackUrl = `${appUrl}/api/shipping-rates`;
      if (existingInk.node.callbackUrl !== currentCallbackUrl) {
        console.log(`[CarrierService] Updating callback URL to ${currentCallbackUrl}`);
        await admin.graphql(`
          mutation carrierServiceUpdate($input: DeliveryCarrierServiceUpdateInput!) {
            carrierServiceUpdate(input: $input) {
              carrierService {
                id
                name
                callbackUrl
              }
              userErrors {
                field
                message
              }
            }
          }
        `, {
          variables: {
            input: {
              id: existingInk.node.id,
              callbackUrl: currentCallbackUrl,
            }
          }
        });
      }
      console.log(`[CarrierService] Already registered (${existingInk.node.id})`);
      return;
    }

    // 2. Register new carrier service
    const callbackUrl = `${appUrl}/api/shipping-rates`;
    console.log(`[CarrierService] Registering with callback: ${callbackUrl}`);

    const createResponse = await admin.graphql(`
      mutation carrierServiceCreate($input: DeliveryCarrierServiceCreateInput!) {
        carrierServiceCreate(input: $input) {
          carrierService {
            id
            name
            callbackUrl
            active
          }
          userErrors {
            field
            message
          }
        }
      }
    `, {
      variables: {
        input: {
          name: CARRIER_SERVICE_NAME,
          callbackUrl,
          supportsServiceDiscovery: true,
          active: true,
        }
      }
    });

    const createData = await createResponse.json();
    const errors = createData?.data?.carrierServiceCreate?.userErrors;

    if (errors && errors.length > 0) {
      console.error("[CarrierService] Registration errors:", JSON.stringify(errors, null, 2));
      return { success: false, error: errors };
    }

    const created = createData?.data?.carrierServiceCreate?.carrierService;
    console.log(`[CarrierService] ✅ Registered: ${created?.name} (${created?.id})`);
    return { success: true, data: created };

  } catch (error) {
    // Don't let carrier service errors break the app
    const errorMessage = error instanceof Error ? error.message : JSON.stringify(error);
    console.error("[CarrierService] Registration failed (non-fatal):", errorMessage);
    return { success: false, error: errorMessage };
  }
}
