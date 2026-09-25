import { flavorLogger } from "./services/ink-log.server";
const console = flavorLogger("firestore-session-storage.server");
import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import firestore from "./firestore.server";
import { isInk } from "./services/app-flavor.server";

// ONE COLLECTION PER APP. The library names an offline session
// `offline_{shop}` — the shop and nothing else, no app identity in the id.
// The Ritualist and ink are two Shopify apps on one Firestore, and a store
// that installs both would have each app overwrite the other's access token
// under the same document id: every API call from the app written second
// answers 401, token exchange re-stores, and the two ping-pong forever. So
// ink keeps its sessions in its own collection. The Ritualist's name is
// untouched — every existing session stays where it is.
//
// Exported for the three routes that touch sessions by hand (uninstall,
// scopes_update, auth.$): the same word everywhere or the ink uninstall
// would delete nothing.
export const SESSION_COLLECTION = isInk() ? "shopify_sessions_ink" : "shopify_sessions";
const COLLECTION = SESSION_COLLECTION;

/** The OTHER app's collection and name — what shop/redact asks before it
 *  purges a merchant record the two apps share. */
export const OTHER_APP = isInk()
  ? { name: "The Ritualist", collection: "shopify_sessions" }
  : { name: "ink", collection: "shopify_sessions_ink" };

/** Does the other app still hold an offline session for this shop — i.e. is
 *  it still installed there? Throws when Firestore cannot answer: the caller
 *  is deciding whether to erase a merchant, and "unknown" must not read as
 *  "no". */
/** This app holds an offline session for the shop: installed now. The
 *  uninstall webhook erases them, so one here means it was reinstalled. */
export async function thisAppHoldsSession(shop: string): Promise<boolean> {
  const snap = await firestore
    .collection(COLLECTION)
    .where("shop", "==", shop)
    .where("isOnline", "==", false)
    .limit(1)
    .get();
  return !snap.empty;
}

export async function otherAppHoldsSession(shop: string): Promise<boolean> {
  const snap = await firestore
    .collection(OTHER_APP.collection)
    .where("shop", "==", shop)
    .where("isOnline", "==", false)
    .limit(1)
    .get();
  return !snap.empty;
}

/**
 * Custom Shopify SessionStorage adapter backed by Cloud Firestore.
 *
 * Implements the full SessionStorage interface that the Shopify framework
 * requires for OAuth session management.
 *
 * Document ID = session.id (Shopify provides this).
 * All session fields are stored as a flat map in the Firestore document.
 */
export class FirestoreSessionStorage implements SessionStorage {
  /**
   * Persist a session. Called by the Shopify framework after OAuth completes
   * and whenever a session is refreshed.
   */
  async storeSession(session: Session): Promise<boolean> {
    try {
      const data = session.toObject();

      // Firestore cannot store `undefined` values, so strip them
      const cleanData: Record<string, any> = {};
      for (const [key, value] of Object.entries(data)) {
        if (value !== undefined) {
          // Convert Date objects to ISO strings for Firestore compatibility
          cleanData[key] =
            value instanceof Date ? value.toISOString() : value;
        }
      }

      console.log(`[FirestoreSessionStorage] storeSession for ${session.id}`);
      await firestore.collection(COLLECTION).doc(session.id).set(cleanData);
      return true;
    } catch (error) {
      console.error("[FirestoreSessionStorage] storeSession error:", error);
      return false;
    }
  }

  /**
   * Load a session by its unique ID.
   */
  async loadSession(id: string): Promise<Session | undefined> {
    try {
      console.log(`[FirestoreSessionStorage] loadSession called for ${id}`);
      const doc = await firestore.collection(COLLECTION).doc(id).get();
      if (!doc.exists) {
        console.log(`[FirestoreSessionStorage] Session ${id} not found in Firestore`);
        return undefined;
      }

      const data = doc.data()!;

      // Convert expires back to Date if present
      if (data.expires && typeof data.expires === "string") {
        data.expires = new Date(data.expires);
      }

      console.log(`[FirestoreSessionStorage] Session ${id} loaded successfully (shop: ${data.shop}, hasAccessToken: ${!!data.accessToken}, scope: ${data.scope}, isOnline: ${data.isOnline})`);
      return new Session(data as any);
    } catch (error) {
      console.error("[FirestoreSessionStorage] loadSession error:", error);
      return undefined;
    }
  }

  /**
   * Delete a single session by ID.
   */
  async deleteSession(id: string): Promise<boolean> {
    try {
      await firestore.collection(COLLECTION).doc(id).delete();
      return true;
    } catch (error) {
      console.error("[FirestoreSessionStorage] deleteSession error:", error);
      return false;
    }
  }

  /**
   * Bulk-delete sessions by their IDs.
   */
  async deleteSessions(ids: string[]): Promise<boolean> {
    try {
      const batch = firestore.batch();
      for (const id of ids) {
        batch.delete(firestore.collection(COLLECTION).doc(id));
      }
      await batch.commit();
      return true;
    } catch (error) {
      console.error("[FirestoreSessionStorage] deleteSessions error:", error);
      return false;
    }
  }

  /**
   * Find all sessions belonging to a specific shop domain.
   * Used by the Shopify framework during token refresh.
   */
  async findSessionsByShop(shop: string): Promise<Session[]> {
    try {
      const snapshot = await firestore
        .collection(COLLECTION)
        .where("shop", "==", shop)
        .get();

      return snapshot.docs.map((doc: any) => {
        const data = doc.data();
        if (data.expires && typeof data.expires === "string") {
          data.expires = new Date(data.expires);
        }
        return new Session(data as any);
      });
    } catch (error) {
      console.error(
        "[FirestoreSessionStorage] findSessionsByShop error:",
        error,
      );
      return [];
    }
  }
}
