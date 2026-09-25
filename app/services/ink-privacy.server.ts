import { createHash, randomUUID } from "node:crypto";
import firestore from "../firestore.server";
import { isInk } from "./app-flavor.server";
import {
  otherAppHoldsSession,
  SESSION_COLLECTION,
  thisAppHoldsSession,
} from "../firestore-session-storage.server";
import { exportCustomerFromInk, purgeShopInInk, redactCustomerInInk } from "./ink-api.server";

export const PRIVACY_COLLECTION = "ink_privacy_requests";
type DeletionTopic = "customers/redact" | "shop/redact";
type PrivacyFlavor = "ink" | "ritualist";
const currentFlavor = (): PrivacyFlavor => (isInk() ? "ink" : "ritualist");
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
    // The two apps can be installed on the same shop. Their deletion jobs
    // must not collide or let one app acknowledge the other's work.
    .update(JSON.stringify([currentFlavor(), shop, topic, request.requestId ?? request]))
    .digest("hex");
  const ref = firestore.collection(PRIVACY_COLLECTION).doc(key);
  try {
    await ref.create({
      shop,
      appFlavor: currentFlavor(),
      topic,
      ...request,
      receivedAt: new Date().toISOString(),
      dueAt: new Date(Date.now() + 30 * 86400000).toISOString(),
      state: "pending",
      attempts: 0,
      nextAttemptAt: new Date().toISOString(),
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

async function eraseOtherPrivacyReceipts(shop: string, keepId: string) {
  for (;;) {
    const snap = await firestore.collection(PRIVACY_COLLECTION).where("shop", "==", shop).limit(400).get();
    const others = snap.docs.filter((d) => d.id !== keepId);
    if (!others.length) return;
    const batch = firestore.batch();
    for (const d of others) batch.delete(d.ref);
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
      const p = payload as { customer?: { id?: unknown; email?: unknown }; orders_to_redact?: unknown } | null;
      const hasReference = Boolean(id(p?.customer?.id) ||
        typeof p?.customer?.email === "string" && p.customer.email ||
        Array.isArray(p?.orders_to_redact) && p.orders_to_redact.some((value) => id(value)));
      if (!hasReference) return new Response("Missing customer reference", { status: 400 });
      const { request } = await retainPrivacyRequest(shop, "customers/redact", payload);
      if (!request.customerId && !request.email && !request.orderIds.length)
        return new Response("Missing customer reference", { status: 400 });
      return new Response("Deletion queued", { status: 200 });
    }
    await retainPrivacyRequest(shop, "shop/redact", {});
    return new Response("Deletion queued", { status: 200 });
  } catch {
    console.error("[ink privacy] processing failed");
    return new Response("Privacy request pending", { status: 503 });
  }
}

/** Run outside the Shopify webhook request. Both backend operations are
 * idempotent; a timed-out partial purge is retried from its saved receipt. */
async function executeDeletion(ref: FirebaseFirestore.DocumentReference, v: FirebaseFirestore.DocumentData) {
  const shop = String(v.shop);
  if (v.topic === "customers/redact") {
    const request = {
      customerId: typeof v.customerId === "string" ? v.customerId : null,
      email: typeof v.email === "string" ? v.email : null,
      orderIds: Array.isArray(v.orderIds) ? v.orderIds.map(String) : [] as string[],
    };
    if (!request.customerId && !request.email && !request.orderIds.length)
      throw new Error("Customer deletion has no identifier");
    const result = await redactCustomerInInk({
      shopDomain: shop,
      customerId: request.customerId,
      customerEmail: request.email,
      orderIds: request.orderIds,
    });
    if (!result.ok) throw new Error(`Customer deletion failed (${result.status})`);
    // Retain access-request metadata, but erase buyer identifiers only after
    // the backend confirms the deletion. Never mark an export delivered here.
    const requests = await firestore.collection(PRIVACY_COLLECTION).where("shop", "==", shop).get();
    for (const d of requests.docs) {
      const item = d.data();
      if (
        (request.customerId && item.customerId === request.customerId) ||
        (request.email && item.email === request.email) ||
        (Array.isArray(item.orderIds) && item.orderIds.some((orderId: string) => request.orderIds.includes(orderId))) ||
        d.id === ref.id
      ) {
        if (item.topic === "customers/data_request")
          await d.ref.update({
            customerId: null, email: null, orderIds: [],
            state: item.state === "downloaded" ? "downloaded" : "response_required_after_redaction",
          });
        else if (item.topic === "customers/redact" && d.id !== ref.id) {
          await d.ref.update({
            customerId: null, email: null, orderIds: [],
            state: "completed", completedAt: new Date().toISOString(),
          });
        }
      }
    }
    return;
  }
  // shop/redact arrives 48 hours after an uninstall, and Shopify's docs do
  // not say a reinstall cancels it. A store that reinstalled is a customer
  // again: its data stays, and its live session is never erased (audit
  // 2026-09-25 — both review stores were uninstalled and reinstalled).
  if (await thisAppHoldsSession(shop)) {
    await ref.update({ state: "skipped_reinstalled", completedAt: new Date().toISOString() });
    return;
  }
  const shared = await otherAppHoldsSession(shop);
  await eraseWhere(SESSION_COLLECTION, shop);
  if (!shared) {
    const result = await purgeShopInInk(shop);
    if (!result.ok) throw new Error(`Shop deletion failed (${result.status})`);
    await eraseWhere("record_charges", shop);
    await eraseWhere("ink_record_charges", shop);
    await firestore.collection("merchants").doc(shop).delete();
    // The job receipt is deleted last. If cleanup fails midway, it survives
    // and the worker can resume from its next attempt.
    await eraseOtherPrivacyReceipts(shop, ref.id);
    await ref.delete();
  } else {
    await eraseWhere(isInk() ? "ink_record_charges" : "record_charges", shop);
    await ref.update({ state: "completed", completedAt: new Date().toISOString() });
  }
}

/** Called by a private scheduled route on each app service. The transaction
 * prevents overlapping invocations from claiming the same receipt. An
 * expired lease is retried, so a worker crash cannot lose a deletion. */
export async function processPendingPrivacy(flavor: PrivacyFlavor = currentFlavor()) {
  const now = Date.now();
  const snap = await firestore.collection(PRIVACY_COLLECTION).where("appFlavor", "==", flavor).get();
  const candidates = snap.docs
    .filter((d) => {
      const v = d.data();
      return (v.topic === "customers/redact" || v.topic === "shop/redact") &&
        (v.state === "pending" && Date.parse(v.nextAttemptAt || "") <= now ||
          v.state === "processing" && Date.parse(v.leaseUntil || "") <= now);
    })
    .sort((a, b) => String(a.data().receivedAt).localeCompare(String(b.data().receivedAt)))
    .slice(0, 1);
  for (const d of candidates) {
    const claimed = await firestore.runTransaction(async (tx) => {
      const fresh = await tx.get(d.ref);
      if (!fresh.exists) return null;
      const v = fresh.data()!;
      if (!(v.state === "pending" && Date.parse(v.nextAttemptAt || "") <= Date.now() ||
        v.state === "processing" && Date.parse(v.leaseUntil || "") <= Date.now())) return null;
      const leaseId = randomUUID();
      tx.update(d.ref, { state: "processing", leaseId, leaseUntil: new Date(Date.now() + 600000).toISOString() });
      return { ...v, leaseId };
    });
    if (!claimed) continue;
    try {
      await executeDeletion(d.ref, claimed);
      const current = await d.ref.get();
      if (current.exists && current.data()?.state === "processing" && current.data()?.leaseId === claimed.leaseId)
        await d.ref.update({
          state: "completed", completedAt: new Date().toISOString(),
          customerId: null, email: null, orderIds: [], leaseUntil: null, leaseId: null,
        });
      return { processed: 1, failed: 0 };
    } catch (error) {
      const attempts = Number((claimed as FirebaseFirestore.DocumentData).attempts || 0) + 1;
      const current = await d.ref.get();
      if (current.exists && current.data()?.leaseId === claimed.leaseId)
        await d.ref.update({
          state: "pending", attempts, leaseId: null, leaseUntil: null,
          nextAttemptAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** Math.min(attempts, 7))).toISOString(),
          lastFailureAt: new Date().toISOString(),
        });
      console.error("[ink privacy] queued deletion failed", error);
      return { processed: 0, failed: 1 };
    }
  }
  return { processed: 0, failed: 0 };
}
