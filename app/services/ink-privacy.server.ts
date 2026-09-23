import { createHash } from "node:crypto";
import firestore from "../firestore.server";
import {
  otherAppHoldsSession,
  SESSION_COLLECTION,
} from "../firestore-session-storage.server";
import { purgeShopInInk, redactCustomerInInk } from "./ink-api.server";

export const PRIVACY_COLLECTION = "ink_privacy_requests";
const id = (v: unknown) =>
  typeof v === "string" || typeof v === "number"
    ? String(v).slice(0, 100)
    : null;

/** Persist before acknowledging. A retry never resets the original deadline. */
export async function retainPrivacyRequest(
  shop: string,
  topic: string,
  payload: any,
) {
  const request = {
    requestId: id(payload?.data_request?.id),
    customerId: id(payload?.customer?.id),
    email:
      typeof payload?.customer?.email === "string"
        ? payload.customer.email.slice(0, 320)
        : null,
    orderIds: (Array.isArray(payload?.orders_requested)
      ? payload.orders_requested
      : Array.isArray(payload?.orders_to_redact)
        ? payload.orders_to_redact
        : []
    )
      .map(id)
      .filter(Boolean),
  };
  const key = createHash("sha256")
    .update(JSON.stringify([shop, topic, request.requestId ?? request]))
    .digest("hex");
  const ref = firestore.collection(PRIVACY_COLLECTION).doc(key);
  try {
    await ref.create({
      shop,
      topic,
      ...request,
      receivedAt: new Date().toISOString(),
      dueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      state: "pending",
    });
  } catch (e) {
    if ((e as { code?: number }).code !== 6) throw e;
  }
  return { ref, request };
}

export async function readPrivacyRequests(shop: string) {
  const snap = await firestore
    .collection(PRIVACY_COLLECTION)
    .where("shop", "==", shop)
    .get();
  return snap.docs
    .map((d) => {
      const v = d.data();
      return {
        id: d.id,
        requestId: v.requestId as string | null,
        topic: String(v.topic),
        receivedAt: String(v.receivedAt),
        dueAt: String(v.dueAt),
      };
    })
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

async function eraseWhere(collection: string, shop: string) {
  // Bounded batches also work after a partial deletion, without a compound index.
  for (;;) {
    const snap = await firestore
      .collection(collection)
      .where("shop", "==", shop)
      .limit(400)
      .get();
    if (snap.empty) return;
    const batch = firestore.batch();
    for (const d of snap.docs) batch.delete(d.ref);
    await batch.commit();
  }
}

export async function handleInkPrivacy(
  topic: "data_request" | "redact" | "shop",
  shop: string,
  payload: unknown,
): Promise<Response> {
  try {
    if (topic === "data_request") {
      await retainPrivacyRequest(shop, "customers/data_request", payload);
      // Receipt only. Settings exposes the outstanding request. A complete
      // backend export by customer/email is still required before submission.
      return new Response("Request received", { status: 200 });
    }
    if (topic === "redact") {
      const { ref, request } = await retainPrivacyRequest(
        shop,
        "customers/redact",
        payload,
      );
      if (!request.customerId && !request.email && !request.orderIds.length)
        return new Response("Missing customer reference", { status: 400 });
      const result = await redactCustomerInInk({
        shopDomain: shop,
        customerId: request.customerId,
        customerEmail: request.email,
        orderIds: request.orderIds,
      });
      if (!result.ok) return new Response("Redaction pending", { status: 503 });
      // Erase identifiers but retain the outstanding access-request receipt.
      // Redaction is not evidence that the requested export was delivered.
      const requests = await firestore
        .collection(PRIVACY_COLLECTION)
        .where("shop", "==", shop)
        .get();
      for (const d of requests.docs) {
        const v = d.data();
        if (
          (request.customerId && v.customerId === request.customerId) ||
          (request.email && v.email === request.email) ||
          (Array.isArray(v.orderIds) &&
            v.orderIds.some((orderId: string) =>
              request.orderIds.includes(orderId),
            )) ||
          d.id === ref.id
        ) {
          if (v.topic === "customers/data_request")
            await d.ref.update({
              customerId: null,
              email: null,
              orderIds: [],
              state: "response_required_after_redaction",
            });
          else await d.ref.delete();
        }
      }
      return new Response("OK");
    }
    await retainPrivacyRequest(shop, "shop/redact", {});
    const shared = await otherAppHoldsSession(shop);
    await eraseWhere(SESSION_COLLECTION, shop);
    if (!shared) {
      const result = await purgeShopInInk(shop);
      if (!result.ok)
        return new Response("Shop redaction pending", { status: 503 });
      await eraseWhere("record_charges", shop);
      await eraseWhere("ink_record_charges", shop);
      await firestore.collection("merchants").doc(shop).delete();
    } else {
      await eraseWhere("ink_record_charges", shop);
    }
    await eraseWhere(PRIVACY_COLLECTION, shop);
    return new Response("OK");
  } catch {
    console.error("[ink privacy] processing failed");
    return new Response("Privacy request pending", { status: 503 });
  }
}
