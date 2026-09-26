// A ROW THAT NEVER LANDS IS ASKED FOR AGAIN, ONCE.
//
// The Orders screens stream each row's record side as its own promise
// (components/InkRecentOrders.tsx WithRecord). On 2026-09-26 one load of the
// Ritualist's Orders kept every row's grey placeholder for over 30 seconds
// although the server had answered every row within 3: the stream reached the
// server's end and never the page's. Three reloads drew at once, so the fault
// is rare and in the browser — and a reviewer who meets it sees a broken list.
//
// This watches the page's row promises. If any is still unsettled after
// STALLED_ROWS_MS it revalidates the route once: a client fetch of the same
// loader, whose fresh promises replace the stuck ones. The server's own record
// read gives up at 15 s (RECORD_READ_TIMEOUT_MS), so a slow but healthy store
// costs at most one extra load, never a loop.

import { useEffect, useRef } from "react";

export const STALLED_ROWS_MS = 12_000;

const isThenable = (v: unknown): v is PromiseLike<unknown> =>
  Boolean(v) && typeof (v as { then?: unknown }).then === "function";

/** The streamed promises among `rows` (rows drawn at once have none). */
export function pendingRowPromises(rows: readonly unknown[] | null | undefined): PromiseLike<unknown>[] {
  if (!rows) return [];
  return rows.flatMap((row) => {
    const more = row && typeof row === "object" ? (row as { more?: unknown }).more : undefined;
    return isThenable(more) ? [more] : [];
  });
}

/** Starts the watch: calls `retry` once if `rows`' promises have not all
 *  settled within `ms`, unless `state.retried` is already set. Returns the
 *  cleanup. Kept apart from React so it can be tested on its own. */
export function watchStalledRows(
  rows: readonly unknown[] | null | undefined,
  retry: () => void,
  state: { retried: boolean },
  ms: number = STALLED_ROWS_MS,
): () => void {
  const pending = pendingRowPromises(rows);
  if (!pending.length || state.retried) return () => {};
  let settled = false;
  let live = true;
  Promise.allSettled(pending.map((p) => Promise.resolve(p))).then(() => {
    settled = true;
  });
  const timer = setTimeout(() => {
    if (!live || settled || state.retried) return;
    state.retried = true;
    console.warn(`[orders] ${pending.length} row(s) still loading after ${ms} ms; asking again once`);
    retry();
  }, ms);
  return () => {
    live = false;
    clearTimeout(timer);
  };
}

/** Revalidate once when the page's row promises have not all settled in time. */
export function useStalledRowsRetry(
  rows: readonly unknown[] | null | undefined,
  revalidate: () => void,
  ms: number = STALLED_ROWS_MS,
): void {
  const state = useRef({ retried: false });
  const revalidateRef = useRef(revalidate);
  revalidateRef.current = revalidate;
  useEffect(() => watchStalledRows(rows, () => revalidateRef.current(), state.current, ms), [rows, ms]);
}
