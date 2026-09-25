import { createHash } from "node:crypto";
import firestore from "../firestore.server";
import { isInk } from "./app-flavor.server";
import {
  otherAppHoldsSession,
  SESSION_COLLECTION,
} from "../firestore-session-storage.server";
import { exportCustomerFromInk, purgeShopInInk, redactCustomerInInk } from "./ink-api.server";

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
        // What happened to it — never who it is about (the screen is told
        // the request, not the customer).
        state: typeof v.state === "string" ? v.state : "pending",
        downloadedAt: typeof v.downloadedAt === "string" ? v.downloadedAt : null,
      };
    })
    .sort((a, b) => a.receivedAt.localeCompare(b.receivedAt));
}

const REQUEST_DOC_ID = /^[0-9a-f]{64}$/;

/** A customers/data_request, answered: the file the merchant downloads from
 *  Settings. The backend builds it from what ink holds NOW (POST
 *  /admin/export-customer), so nothing about the customer is copied into
 *  this app's store; the request doc keeps only its receipt and when it was
 *  downloaded. A request whose customer was erased first answers with a
 *  file that says so. Refused for another shop's request or any other topic. */
export async function exportPrivacyRequest(
  shop: string,
  requestDocId: string,
): Promise<
  | { ok: true; download: Record<string, unknown>; filename: string }
  | { ok: false; note: string }
> {
  if (!REQUEST_DOC_ID.test(requestDocId))
    return { ok: false, note: "Unknown request." }; // PLACEHOLDER
  const ref = firestore.collection(PRIVACY_COLLECTION).doc(requestDocId);
  const snap = await ref.get();
  const v = snap.exists ? snap.data() : null;
  if (!v || v.shop !== shop || v.topic !== "customers/data_request")
    return { ok: false, note: "Unknown request." }; // PLACEHOLDER
  const name = `ink-customer-data-${String(v.requestId || requestDocId.slice(0, 12)).replace(/[^A-Za-z0-9_-]/g, "")}.json`;
  const receipt = {
    request_id: v.requestId ?? null,
    received_at: v.receivedAt ?? null,
    due_at: v.dueAt ?? null,
  };
  const orderIds: string[] = Array.isArray(v.orderIds) ? v.orderIds : [];
  if (!v.customerId && !v.email && orderIds.length === 0) {
    // Erased by a customers/redact before anyone downloaded it.
    return {
      ok: true,
      filename: name,
      download: {
        kind: "ink.customer_data_export",
        ...receipt,
        generated_at: new Date().toISOString(),
        note: "This customer's data was deleted by a Shopify deletion request before this copy was downloaded. ink holds no record of them on this store.", // PLACEHOLDER
        orders: [],
      },
    };
  }
  const result = await exportCustomerFromInk({
    shopDomain: shop,
    customerId: v.customerId ?? null,
    customerEmail: v.email ?? null,
    orderIds,
  });
  if (!result.ok || !result.body?.ok)
    return { ok: false, note: "The data could not be prepared. Try again." }; // PLACEHOLDER
  const exported = result.body.export;
  const download = exported
    ? { ...exported, request_id: receipt.request_id, received_at: receipt.received_at, due_at: receipt.due_at }
    : {
        kind: "ink.customer_data_export",
        ...receipt,
        generated_at: new Date().toISOString(),
        note: "ink holds no records for this store.", // PLACEHOLDER
        orders: [],
      };
  await ref.update({ state: "downloaded", downloadedAt: new Date().toISOString() });
  return { ok: true, download, filename: name };
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
      // The receipt, kept before the 200. The merchant downloads the
      // customer's data from Settings (exportPrivacyRequest): the backend
      // builds it from what ink holds at that moment, so no copy of it is
      // stored here.
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
              // A copy already downloaded stays downloaded; one never
              // downloaded now answers that the customer was erased first.
              state:
                v.state === "downloaded"
                  ? "downloaded"
                  : "response_required_after_redaction",
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
      // The other app still holds this store: erase only THIS app's own
      // charge bindings (the Ritualist's must never clear ink's, 2026-09-25).
      await eraseWhere(isInk() ? "ink_record_charges" : "record_charges", shop);
    }
    // The receipts are shared by both app identities. Keep them until the
    // last installation is gone, so the other app can still answer requests.
    if (!shared) await eraseWhere(PRIVACY_COLLECTION, shop);
    return new Response("OK");
  } catch {
    console.error("[ink privacy] processing failed");
    return new Response("Privacy request pending", { status: 503 });
  }
}
