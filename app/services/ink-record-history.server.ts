import firestore from "../firestore.server";
import { PROOF_ID } from "./ink-reader.server";

const PAGE_SIZE = 10;
const STATES = new Set(["creating", "pending", "paid_pending_record", "minted"]);

export type InkRecordHistoryRow = {
  proofId: string;
  orderName: string | null;
  createdAt: string | null;
  state: string;
};

/** This app's Shopify charge bindings, scoped to the authenticated shop. */
export async function readInkRecordHistory(shop: string, requestedPage: number) {
  const snapshot = await firestore
    .collection("ink_record_charges")
    .where("shop", "==", shop)
    .get();
  const rows: InkRecordHistoryRow[] = snapshot.docs
    .map((doc) => doc.data())
    .filter((row) => row.shop === shop && PROOF_ID.test(row.proofId) && STATES.has(row.state))
    .map((row) => ({
      proofId: row.proofId,
      orderName: typeof row.orderName === "string" && row.orderName.length <= 60 ? row.orderName : null,
      createdAt: typeof row.createdAt === "string" && !Number.isNaN(Date.parse(row.createdAt)) ? row.createdAt : null,
      state: row.state,
    }))
    .sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0
    ? Math.min(requestedPage, Math.max(1, Math.ceil(rows.length / PAGE_SIZE)))
    : 1;
  return {
    rows: rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    page,
    hasNext: page * PAGE_SIZE < rows.length,
    hasPrevious: page > 1,
  };
}
