// The Orders screens ask again, once, when a streamed row never lands.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { pendingRowPromises, watchStalledRows, STALLED_ROWS_MS } from "./use-stalled-rows-retry";

beforeEach(() => {
  vi.useFakeTimers();
  vi.spyOn(console, "warn").mockImplementation(() => {});
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const never = () => new Promise<never>(() => {});
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await Promise.resolve(); };

describe("pendingRowPromises", () => {
  it("finds only streamed rows", () => {
    const p = Promise.resolve(1);
    expect(pendingRowPromises([{ id: "a" }, { id: "b", more: p }, null])).toEqual([p]);
    expect(pendingRowPromises(undefined)).toEqual([]);
  });
});

describe("watchStalledRows", () => {
  it("asks again once when a row is still loading after the limit", async () => {
    const retry = vi.fn();
    const state = { retried: false };
    watchStalledRows([{ more: never() }, { more: Promise.resolve({}) }], retry, state);
    await flush();
    vi.advanceTimersByTime(STALLED_ROWS_MS - 1);
    expect(retry).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(retry).toHaveBeenCalledTimes(1);
    // The fresh rows stall as well: no second ask on the same page.
    watchStalledRows([{ more: never() }], retry, state);
    vi.advanceTimersByTime(STALLED_ROWS_MS * 3);
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("does nothing when every row lands, even as a failure", async () => {
    const retry = vi.fn();
    const failed = Promise.reject(new Error("read failed"));
    failed.catch(() => {});
    watchStalledRows([{ more: Promise.resolve({}) }, { more: failed }], retry, { retried: false });
    await flush();
    vi.advanceTimersByTime(STALLED_ROWS_MS * 2);
    expect(retry).not.toHaveBeenCalled();
  });

  it("does nothing for rows drawn at once, or after the page moved on", () => {
    const retry = vi.fn();
    watchStalledRows([{ id: "a" }], retry, { retried: false });
    const stop = watchStalledRows([{ more: never() }], retry, { retried: false });
    stop();
    vi.advanceTimersByTime(STALLED_ROWS_MS * 2);
    expect(retry).not.toHaveBeenCalled();
  });
});
