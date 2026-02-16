import firestore from "./firestore.server";

const COLLECTION = "shopify_sessions";

interface ShopifySession {
  id: string;
  shop: string;
  state: string;
  isOnline: boolean;
  scope?: string;
  expires?: string;
  accessToken: string;
  userId?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  accountOwner?: boolean;
  locale?: string;
  collaborator?: boolean;
  emailVerified?: boolean;
}

/**
 * Get the first offline session from Firestore.
 *
 * This replaces the repeated pattern across all route files:
 *   const { PrismaClient } = await import("@prisma/client");
 *   const prisma = new PrismaClient();
 *   const session = await prisma.session.findFirst({ where: { isOnline: false } });
 *
 * @param shopDomain  Optional shop domain to filter by (e.g. "mystore.myshopify.com")
 * @returns           The session object, or null if none found
 */
export async function getOfflineSession(
  shopDomain?: string,
): Promise<ShopifySession | null> {
  try {
    let query = firestore
      .collection(COLLECTION)
      .where("isOnline", "==", false)
      .limit(1);

    if (shopDomain) {
      query = firestore
        .collection(COLLECTION)
        .where("isOnline", "==", false)
        .where("shop", "==", shopDomain)
        .limit(1);
    }

    const snapshot = await query.get();

    if (snapshot.empty) {
      return null;
    }

    return snapshot.docs[0].data() as ShopifySession;
  } catch (error) {
    console.error("[getOfflineSession] Error:", error);
    return null;
  }
}
