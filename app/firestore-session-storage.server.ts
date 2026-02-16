import { Session } from "@shopify/shopify-api";
import type { SessionStorage } from "@shopify/shopify-app-session-storage";
import firestore from "./firestore.server";

const COLLECTION = "shopify_sessions";

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
      const doc = await firestore.collection(COLLECTION).doc(id).get();
      if (!doc.exists) return undefined;

      const data = doc.data()!;

      // Convert expires back to Date if present
      if (data.expires && typeof data.expires === "string") {
        data.expires = new Date(data.expires);
      }

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
