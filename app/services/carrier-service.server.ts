/**
 * Carrier Service Registration Utility
 *
 * Registers the app as a Carrier Service so Shopify calls our
 * /api/shipping-rates endpoint at checkout to provide shipping options.
 *
 * The carrier service can be toggled active/inactive per-shop via
 * `setCarrierServiceActive`. When a merchant switches to "background"
 * delivery mode, we set active=false so Shopify stops calling our
 * callback and the customer no longer sees INK at checkout.
 */

const CARRIER_SERVICE_NAME = "ink. Verified Delivery";

/**
 * Find this shop's INK carrier service id (or null if not registered).
 */
async function findInkCarrierServiceId(admin: any): Promise<string | null> {
  const response = await admin.graphql(`
    query {
      carrierServices(first: 10) {
        edges {
          node {
            id
            name
          }
        }
      }
    }
  `);
  const data = await response.json();
  const edges = data?.data?.carrierServices?.edges || [];
  const match = edges.find(
    (edge: any) => edge.node.name === CARRIER_SERVICE_NAME
  );
  return match?.node?.id || null;
}

/**
 * Toggle the carrier service active flag for this shop.
 * Called when a merchant flips between "addon" and "background" modes.
 *
 * Returns true on success, false if the service couldn't be found or the
 * update failed. Errors are logged but not thrown — the caller's mode-save
 * shouldn't fail because the carrier service update couldn't propagate.
 */
export async function setCarrierServiceActive(
  admin: any,
  active: boolean
): Promise<boolean> {
  try {
    const serviceId = await findInkCarrierServiceId(admin);
    if (!serviceId) {
      console.warn(
        `[CarrierService] setActive(${active}): no INK carrier service found for this shop — skipping`
      );
      return false;
    }

    const response = await admin.graphql(
      `
      mutation carrierServiceUpdate($input: DeliveryCarrierServiceUpdateInput!) {
        carrierServiceUpdate(input: $input) {
          carrierService {
            id
            name
            active
          }
          userErrors { field message }
        }
      }
    `,
      {
        variables: {
          input: {
            id: serviceId,
            active,
          },
        },
      }
    );

    const result = await response.json();
    const errors = result?.data?.carrierServiceUpdate?.userErrors;
    if (errors && errors.length > 0) {
      console.error(
        `[CarrierService] setActive(${active}) errors:`,
        JSON.stringify(errors, null, 2)
      );
      return false;
    }

    console.log(
      `[CarrierService] ✅ active=${active} on ${serviceId}`
    );
    return true;
  } catch (err) {
    const msg = err instanceof Error ? err.message : JSON.stringify(err);
    console.error(`[CarrierService] setActive(${active}) failed:`, msg);
    return false;
  }
}

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
