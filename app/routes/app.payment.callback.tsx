import { type LoaderFunctionArgs } from "react-router";
import { authenticate } from "../shopify.server";
import { createMerchant, adminCreateUser } from "../services/ink-api.server";
import { updateMerchant } from "../services/merchant.server";

// Temp password for the merchant's Parallel login. 16 chars, mixed classes
// (excludes ambiguous chars) to satisfy typical complexity rules. The merchant
// changes it on first login; it's stored on the merchant doc so onboarding can
// surface it.
function generateTempPassword(): string {
  const upper = "ABCDEFGHJKMNPQRSTUVWXYZ";
  const lower = "abcdefghijkmnpqrstuvwxyz";
  const digit = "23456789";
  const sym = "!@#$%^&*";
  const all = upper + lower + digit + sym;
  const pick = (s: string) => s[Math.floor(Math.random() * s.length)];
  let pw = pick(upper) + pick(lower) + pick(digit) + pick(sym);
  for (let i = 0; i < 12; i++) pw += pick(all);
  return pw;
}

export const loader = async ({ request }: LoaderFunctionArgs) => {
  const { session, admin } = await authenticate.admin(request);
  const url = new URL(request.url);
  const chargeId = url.searchParams.get("charge_id");

  if (!chargeId) {
    return Response.redirect(`${process.env.SHOPIFY_APP_URL}/app/payment`);
  }
  
  try {
    const shopResponse = await admin.graphql(`{ shop { name email myshopifyDomain } }`);
    const shopData = await shopResponse.json();
    const { name, email, myshopifyDomain } = shopData.data.shop;

    // Check for bypass
    if (chargeId !== "bypass") {
        // Verify charge status if needed, but for now we assume callback means success 
        // (normally we'd query the charge ID to be sure)
    } else {
        console.log("Bypassing billing check for Custom App credentials.");
    }

    console.log("Registering merchant with INK API:", { myshopifyDomain, name, email });
    
    // Call external API
    const inkData = await createMerchant(myshopifyDomain, name, email);
    
    // Store in Firestore "merchants" collection
    if (inkData && inkData.api_key) {
        await updateMerchant(session.shop, {
            ink_api_key: inkData.api_key,
            payment_status: "active"
        });
    } else {
        throw new Error("No API key returned from INK");
    }

    // Provision a Parallel login USER so the merchant can sign into
    // parallel.in.ink. Install creates a merchant but no user otherwise, so
    // there's no credential to log in with. Soft-fail: this must NEVER block
    // the install/billing callback — if it fails, the install still completes
    // and we log it. Credential is stored on the merchant doc for onboarding
    // to surface (merchant changes it on first login).
    try {
        const merchantId = inkData.merchant_id ?? inkData.shop_id ?? inkData.id;
        if (merchantId) {
            const tempPassword = generateTempPassword();
            await adminCreateUser(merchantId, name || myshopifyDomain, email, tempPassword);
            await updateMerchant(session.shop, {
                parallel_login_email: email,
                parallel_temp_password: tempPassword,
                parallel_user_provisioned_at: new Date().toISOString(),
            });
            console.log(`[payment.callback] Provisioned Parallel login user for ${email}`);
        } else {
            console.warn("[payment.callback] No merchant_id in createMerchant response — skipped user provisioning");
        }
    } catch (provisionErr) {
        console.warn(
            "[payment.callback] User provisioning soft-failed (install continues):",
            provisionErr instanceof Error ? provisionErr.message : provisionErr,
        );
    }

  } catch (error) {
    console.error("Callback Error:", error);
    // Mark as paid even if API fails? No, retry.
    // For now we assume success if charge worked but API failed, so user isn't stuck.
    // We can show a banner later.
    await updateMerchant(session.shop, { payment_status: "active" });
    return Response.redirect(`${process.env.SHOPIFY_APP_URL}/app/payment?error=registration_failed`);
  }
  
  // Preserve query parameters (embedded, shop, host, hmac, etc.)
  const redirectUrl = new URL(`${process.env.SHOPIFY_APP_URL}/app/dashboard`);
  redirectUrl.search = url.search;
  // Remove charge_id from the forwarded params as it's no longer needed and clutters the URL
  redirectUrl.searchParams.delete("charge_id");
  
  return Response.redirect(redirectUrl.toString());
};
