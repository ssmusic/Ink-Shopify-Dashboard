/**
 * Carrier Service Registration Utility
 *
 * Registers the app as a Carrier Service so Shopify calls our
 * /api/shipping-rates endpoint at checkout to provide shipping options.
 *
 * App Store review posture: INK runs in background mode. The carrier service
 * remains registered only so legacy installs can be deactivated; it must not
 * expose a customer-paid checkout option.
 */

/** The carrier service's name, as Shopify shows it to the merchant in
 *  Settings → Shipping and delivery (the service is inactive and returns no
 *  rates, so no checkout shows it). ⚠️ PLACEHOLDER — Sam's word. Was
 *  "ink. Verified Delivery" (Sam, 2026-09-24: "wrong" — ink never says a
 *  delivery was verified). */
export const CARRIER_SERVICE_NAME = "ink.";

/** The names this app registered before. A shop that holds one is renamed
 *  in place by ensureCarrierServiceRegistered, through the same
 *  carrierServiceUpdate it already makes — never a second service beside it. */
export const LEGACY_CARRIER_SERVICE_NAMES: readonly string[] = ["ink. Verified Delivery"];

/** Is this carrier service ours, under its name or an old one? */
export function isInkCarrierServiceName(name: unknown): boolean {
  return name === CARRIER_SERVICE_NAME || (typeof name === "string" && LEGACY_CARRIER_SERVICE_NAMES.includes(name));
}

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
    (edge: any) => isInkCarrierServiceName(edge.node.name)
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
      (edge: any) => isInkCarrierServiceName(edge.node.name)
    );

    if (existingInk) {
      // Already registered — check if callback URL needs updating and force
      // inactive so no customer-paid INK delivery option appears at checkout.
      // A service still wearing an old name ("ink. Verified Delivery") is
      // renamed here, in the same update (2026-09-24).
      const currentCallbackUrl = `${appUrl}/api/shipping-rates`;
      const renamed = existingInk.node.name !== CARRIER_SERVICE_NAME;
      if (renamed || existingInk.node.callbackUrl !== currentCallbackUrl || existingInk.node.active) {
        console.log(`[CarrierService] Updating callback URL to ${currentCallbackUrl}${renamed ? `, the name to "${CARRIER_SERVICE_NAME}"` : ""} and deactivating`);
        const update = (input: Record<string, unknown>) => admin.graphql(`
          mutation carrierServiceUpdate($input: DeliveryCarrierServiceUpdateInput!) {
            carrierServiceUpdate(input: $input) {
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
        `, { variables: { input } });
        const base = { id: existingInk.node.id, callbackUrl: currentCallbackUrl, active: false };
        const res = await update(renamed ? { ...base, name: CARRIER_SERVICE_NAME } : base);
        const errors = (await res.json())?.data?.carrierServiceUpdate?.userErrors;
        if (errors && errors.length > 0) {
          console.error("[CarrierService] Update errors:", JSON.stringify(errors, null, 2));
          // A refused rename must never cost the deactivation: the update is
          // one mutation, so Shopify refuses all of it. Keep the old name and
          // make sure the service is off.
          if (renamed) await update(base);
        }
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
          active: false,
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
