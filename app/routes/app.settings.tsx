import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import { getInventory, getInventoryByShopDomain } from "../services/ink-api.server";
import Settings from "../components/settings/Settings";

export async function loader({ request }: LoaderFunctionArgs) {
  const { admin, session } = await authenticate.admin(request);
  
  // 1. Get shop details from Shopify
  const response = await admin.graphql(
    `#graphql
      query {
        shop {
          name
          primaryDomain { url host }
          contactEmail
          myshopifyDomain
        }
      }
    `
  );
  
  const shopData = await response.json();
  const shop = shopData.data?.shop;
  
  // 2. Get Merchant details from Firestore to get accurate install date and api_key
  let installedDate = "Not available";
  let inventoryStr = "0";
  let usedStr = "0";

  try {
    const merchantDocs = await firestore.collection("merchants").where("shopDomain", "==", session.shop).limit(1).get();
    if (!merchantDocs.empty) {
        const data = merchantDocs.docs[0].data();
        if (data.createdAt) {
            const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
            installedDate = new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(date);
        }
    }

    // 3. Fetch real inventory — use admin-level Firestore lookup (no API key needed)
    try {
      const invInfo = await getInventoryByShopDomain(session.shop);
      if (invInfo) {
        inventoryStr = (invInfo.current_count || 0).toString();
        usedStr = (invInfo.used_this_month || 0).toString();
      }
    } catch (e) {
      console.warn("Could not fetch actual inventory:", e);
    }
  } catch (firestoreErr) {
    console.warn("[Settings Loader] Firestore unavailable, skipping install date:", firestoreErr);
  }

  const payload = {
     shopName: shop?.name || session.shop.replace(".myshopify.com", ""),
     shopDomain: session.shop,
     primaryDomain: shop?.primaryDomain?.host || session.shop,
     // No hardcoded fallback — use empty string if Shopify doesn't return one
     contactEmail: shop?.contactEmail || "",
     installedDate,
     inventoryData: {
       current: inventoryStr,
       usedThisPeriod: usedStr
     }
  };

  return json(payload);
}

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  return <Settings initialData={data} />;
}
