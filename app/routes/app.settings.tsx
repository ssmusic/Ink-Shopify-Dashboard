import { useLoaderData, type LoaderFunctionArgs } from "react-router";
import { json } from "@remix-run/node";
import { authenticate } from "../shopify.server";
import firestore from "../firestore.server";
import { getInventory, getInventoryByShopDomain, getShopIdByDomain } from "../services/ink-api.server";
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
  // Empty, not "Not available" — the component hides the row when there is no
  // date, and a field reading "Not available" looks like a failure rather than
  // an absence.
  let installedDate = "";
  let inventoryStr = "0";
  let usedStr = "0";

  try {
    // BY DOCUMENT ID FIRST. The embedded app provisions with
    // `merchants.doc(shop).set({ shop, … })`, so `where("shopDomain", …)` never
    // matched it — which is why this read "Not available" for every merchant,
    // permanently, no matter how long ago they installed. The query is kept as
    // a fallback: the standalone auth path creates docs with random ids and a
    // `shopDomain` field.
    let data: Record<string, any> | undefined;
    const byId = await firestore.collection("merchants").doc(session.shop).get();
    if (byId.exists) {
      data = byId.data();
    } else {
      const merchantDocs = await firestore.collection("merchants").where("shopDomain", "==", session.shop).limit(1).get();
      if (!merchantDocs.empty) data = merchantDocs.docs[0].data();
    }
    if (data?.createdAt) {
      const date = data.createdAt.toDate ? data.createdAt.toDate() : new Date(data.createdAt);
      if (!Number.isNaN(date.getTime())) {
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
     shopId: "", // Will be populated below if available
     primaryDomain: shop?.primaryDomain?.host || session.shop,
     contactEmail: shop?.contactEmail || "",
     installedDate,
     inventoryData: {
       current: inventoryStr,
       usedThisPeriod: usedStr
     }
  };

  // Populate shopId if found during inventory fetch
  try {
    payload.shopId = await getShopIdByDomain(session.shop);
  } catch (e) {
    console.warn("Could not fetch shopId:", e);
  }

  return json(payload);
}

export default function SettingsPage() {
  const data = useLoaderData<typeof loader>();
  return <Settings initialData={data} />;
}
