import { flavorLogger } from "./services/ink-log.server";
const console = flavorLogger("session-utils.server");
import firestore from "./firestore.server";
import { SESSION_COLLECTION } from "./firestore-session-storage.server";

// The flavor's own collection (firestore-session-storage.server.ts): the
// Ritualist's name is what it always was; ink's is its own.
const COLLECTION = SESSION_COLLECTION;

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

    return await withFreshToken(snapshot.docs[0].data() as ShopifySession);
  } catch (error) {
    console.error("[getOfflineSession] Error:", error);
    return null;
  }
}

// EXPIRING OFFLINE TOKENS, FOR EVERY CALLER THAT READS THE TOKEN ITSELF.
// shopify.server.ts turns on `expiringOfflineAccessTokens`: a token lives an
// hour and the library refreshes it — but only on its own paths
// (authenticate.*, unauthenticated.admin). Routes that read a session document
// straight out of Firestore and send `X-Shopify-Access-Token` themselves never
// passed through that refresh, so an hour after the merchant last opened the
// app they sent a dead token and Shopify answered 401. This puts every such
// read through the library's own refresh.
//
// A token with no `expires` is a legacy non-expiring one: there is nothing to
// refresh, and it is returned as it is. A refresh that fails returns the
// document unchanged, so a caller is never worse off than before.

/** Refresh this many ms before expiry — the library's own margin. */
export const REFRESH_MARGIN_MS = 5 * 60 * 1000;

type TokenDoc = { shop?: string; accessToken?: string; expires?: unknown };

/** True when a stored token expires within the margin (or already has). */
export function tokenNeedsRefresh(doc: TokenDoc, now = Date.now()): boolean {
  if (!doc?.expires) return false;
  const at = doc.expires instanceof Date ? doc.expires.getTime() : new Date(String(doc.expires)).getTime();
  if (!Number.isFinite(at)) return true;
  return at - now <= REFRESH_MARGIN_MS;
}

/** The same document with a live access token, refreshed through the Shopify
 *  library when it is about to expire. */
export async function withFreshToken<T extends TokenDoc>(doc: T): Promise<T> {
  if (!doc?.shop || !tokenNeedsRefresh(doc)) return doc;
  try {
    const { unauthenticated } = await import("./shopify.server");
    const { session } = await unauthenticated.admin(doc.shop);
    if (!session?.accessToken) return doc;
    return {
      ...doc,
      accessToken: session.accessToken,
      expires: session.expires instanceof Date ? session.expires.toISOString() : doc.expires,
    };
  } catch (error) {
    console.error(`[withFreshToken] refresh failed for ${doc.shop}:`, error);
    return doc;
  }
}

/** Every document in the list with a live token (see withFreshToken). */
export function withFreshTokens<T extends TokenDoc>(docs: T[]): Promise<T[]> {
  return Promise.all(docs.map((d) => withFreshToken(d)));
}
