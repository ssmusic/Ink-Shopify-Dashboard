import { describe, expect, it } from "vitest";
import { activationMarkerId, spendFromCap } from "./activation-counter.server";

// THE CAP — "run it on my next 200 orders."
//
// A cap is the one part of a slice that cannot be answered from an order
// alone, so these pin the two things that would otherwise make it lie to a
// merchant: counting the same order twice, and letting two orders both
// spend the last one.

/** A Firestore stand-in with just enough transaction to be honest about
 *  ordering: every read must precede every write, and writes only land when
 *  the transaction body returns. */
function fakeFirestore(initial: Record<string, any> = {}) {
  const docs = new Map<string, any>(Object.entries(initial));
  const ref = (path: string) => ({
    path,
    get _key() {
      return path;
    },
  });
  const firestore: any = {
    docs,
    collection: (name: string) => ({ doc: (id: string) => ref(`${name}/${id}`) }),
    async runTransaction(fn: (tx: any) => Promise<any>) {
      const writes: Array<[string, any, boolean]> = [];
      let reading = true;
      const tx = {
        async get(r: any) {
          if (!reading) throw new Error("read after write in a transaction");
          const data = docs.get(r.path);
          return { exists: data !== undefined, data: () => data };
        },
        set(r: any, value: any, opts?: { merge?: boolean }) {
          reading = false;
          writes.push([r.path, value, Boolean(opts?.merge)]);
        },
      };
      const out = await fn(tx);
      for (const [path, value, merge] of writes) {
        docs.set(path, merge ? { ...(docs.get(path) ?? {}), ...value } : value);
      }
      return out;
    },
  };
  return { firestore, docs, ref };
}

const MERCHANT = "merchants/shop.myshopify.com";

describe("an order id that is not a document id", () => {
  it("escapes the slashes Shopify puts in order names", () => {
    // Same escaping the backend's enroll lock already does — a slash is
    // illegal in a Firestore id and order names carry them (#1001/2).
    expect(activationMarkerId("s.myshopify.com", "1001/2")).toBe("s.myshopify.com__1001_2");
    expect(activationMarkerId("s.myshopify.com", 1001)).toBe("s.myshopify.com__1001");
  });
});

describe("spending from a cap", () => {
  it("grants a page and moves the tally by exactly one", async () => {
    const { firestore, docs } = fakeFirestore({ [MERCHANT]: { activation_count: { activated: 4 } } });
    const out = await spendFromCap(firestore, { path: MERCHANT } as any, "s", "1001", 200);

    expect(out).toEqual({ ok: true, cap: 200, used: 5, replay: false });
    expect(docs.get(MERCHANT).activation_count.activated).toBe(5);
  });

  it("starts from zero for a merchant who has never had one", async () => {
    const { firestore, docs } = fakeFirestore({ [MERCHANT]: {} });
    const out = await spendFromCap(firestore, { path: MERCHANT } as any, "s", "1", 3);

    expect(out.ok).toBe(true);
    expect(docs.get(MERCHANT).activation_count.activated).toBe(1);
  });

  it("keeps the `since` stamp rather than restarting it every order", async () => {
    const { firestore, docs } = fakeFirestore({
      [MERCHANT]: { activation_count: { since: "2026-08-27T00:00:00.000Z", activated: 1 } },
    });
    await spendFromCap(firestore, { path: MERCHANT } as any, "s", "1", 10);

    expect(docs.get(MERCHANT).activation_count).toEqual({
      since: "2026-08-27T00:00:00.000Z",
      activated: 2,
    });
  });

  it("refuses once the cap is spent, and never goes past it", async () => {
    const { firestore, docs } = fakeFirestore({
      [MERCHANT]: { activation_count: { activated: 200 } },
    });
    const out = await spendFromCap(firestore, { path: MERCHANT } as any, "s", "999", 200);

    expect(out).toEqual({ ok: false, cap: 200, used: 200, replay: false });
    // The tally did not move — a refusal costs nothing.
    expect(docs.get(MERCHANT).activation_count.activated).toBe(200);
  });
});

describe("A REDELIVERY IS NOT A SECOND ORDER", () => {
  it("answers the same thing twice and spends once", async () => {
    // Shopify is at-least-once, and this handler deliberately returns 500 to
    // ask for a redelivery — so the same order arrives again as a matter of
    // routine. Counting it twice would rob the merchant of a page they paid
    // no attention to.
    const { firestore, docs } = fakeFirestore({ [MERCHANT]: {} });
    const first = await spendFromCap(firestore, { path: MERCHANT } as any, "s", "1001", 2);
    const again = await spendFromCap(firestore, { path: MERCHANT } as any, "s", "1001", 2);

    expect(first).toEqual({ ok: true, cap: 2, used: 1, replay: false });
    expect(again.ok).toBe(true);
    expect(again.replay).toBe(true);
    expect(docs.get(MERCHANT).activation_count.activated).toBe(1);
  });

  it("remembers a REFUSAL too, so a redelivery is not re-judged later", async () => {
    // Without this, an order refused at 200/200 could be redelivered after
    // the merchant raised their cap and quietly become a page — a different
    // answer for the same order, decided by timing.
    const { firestore } = fakeFirestore({ [MERCHANT]: { activation_count: { activated: 1 } } });
    const refused = await spendFromCap(firestore, { path: MERCHANT } as any, "s", "1001", 1);
    const again = await spendFromCap(firestore, { path: MERCHANT } as any, "s", "1001", 99);

    expect(refused.ok).toBe(false);
    expect(again.ok).toBe(false);
    expect(again.replay).toBe(true);
  });

  it("counts different orders separately", async () => {
    const { firestore, docs } = fakeFirestore({ [MERCHANT]: {} });
    await spendFromCap(firestore, { path: MERCHANT } as any, "s", "1", 5);
    await spendFromCap(firestore, { path: MERCHANT } as any, "s", "2", 5);

    expect(docs.get(MERCHANT).activation_count.activated).toBe(2);
  });
});

describe("the transaction's shape", () => {
  it("reads everything before it writes anything", async () => {
    // Firestore refuses a read after a write inside a transaction; the fake
    // above throws on it, so this test fails loudly if the order slips.
    const { firestore } = fakeFirestore({ [MERCHANT]: {} });
    await expect(
      spendFromCap(firestore, { path: MERCHANT } as any, "s", "1", 10),
    ).resolves.toMatchObject({ ok: true });
  });
});
