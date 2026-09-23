// EACH ORDER'S RECORD, READ FOR THE SCREEN — and said in the record page's words.

import { describe, expect, it, vi } from "vitest";
import { readRecord, readRecords, recordFromBody } from "./ink-record.server";
import { elementLines, locationWordOf, opensOf } from "../lib/record-words";

const PROOF = "proof_aec827b527fb30457c1da890";
// The backend's public read, as it answered for Corvara #1010 on 2026-09-23.
const BODY = {
  proof_id: PROOF,
  audience: "public",
  summary: { order_number: "#1010", buyer_initials: "SM", opens: 1 },
  verdict: {
    elements: [
      {
        element: "order",
        required: true,
        label: "Order",
        value: {
          order_number: "#1010",
          enrolled_at: "2026-08-20T18:50:54.195Z",
        },
        status: "attested",
      },
      {
        element: "delivery_date",
        required: true,
        label: "Delivery date",
        value: null,
        status: "missing",
      },
      {
        element: "the_open",
        required: true,
        label: "The open",
        value: {
          opens: 1,
          first_open_signed: true,
          location: {
            verdict: "flagged",
            distance_m: 719,
            accuracy_m: 35,
            signed: false,
            later_share: { verdict: "pass", distance_m: 40 },
          },
        },
        status: "verified",
      },
    ],
    elements_complete: false,
  },
  record: { locked: true, price_cents: 2900, currency: "USD" },
};
const ok = (body: unknown) =>
  vi.fn(
    async () => new Response(JSON.stringify(body), { status: 200 }),
  ) as unknown as typeof fetch;

describe("readRecord", () => {
  it("reads the merchant words projection with its own key — and keeps the words of a locked record", async () => {
    const f = ok(BODY);
    const r = await readRecord("merchant-test", PROOF, f);
    expect(
      (f as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0],
    ).toBe(
      `https://us-central1-inink-c76d3.cloudfunctions.net/api/proofs/${PROOF}/audit`,
    );
    expect(r?.locked).toBe(true);
    expect(r?.elements.map((e) => e.element)).toEqual([
      "order",
      "delivery_date",
      "the_open",
    ]);
    expect(opensOf(r)).toBe(1);
  });

  it("is nothing for a value that is not a proof id, a refusal, or a slow read — never an error page", async () => {
    const f = ok(BODY);
    expect(await readRecord("merchant-test", "nfc_abc", f)).toBeNull();
    expect(f).not.toHaveBeenCalled();
    expect(
      await readRecord(
        "merchant-test",
        PROOF,
        vi.fn(
          async () => new Response("{}", { status: 404 }),
        ) as unknown as typeof fetch,
      ),
    ).toBeNull();
    expect(
      await readRecord(
        "merchant-test",
        PROOF,
        vi.fn(async () => {
          throw new Error("timeout");
        }) as unknown as typeof fetch,
      ),
    ).toBeNull();
    expect(recordFromBody({ nope: true })).toBeNull();
  });

  it("reads each listed order once, side by side, and drops the ones that failed", async () => {
    const f = vi.fn(async (url: string) =>
      url.endsWith(`${PROOF}/audit`)
        ? new Response(JSON.stringify(BODY))
        : new Response("{}", { status: 500 }),
    ) as unknown as typeof fetch;
    const out = await readRecords(
      "merchant-test",
      [PROOF, PROOF, null, "proof_000000000000000000000000"],
      f,
    );
    expect(Object.keys(out)).toEqual([PROOF]);
    expect(
      (f as unknown as { mock: { calls: unknown[] } }).mock.calls,
    ).toHaveLength(2);
  });
});

describe("the record in words", () => {
  const record = recordFromBody(BODY)!;

  it("says each value the way the public record page does — never a coordinate", () => {
    const open = record.elements.find((e) => e.element === "the_open")!;
    expect(elementLines(open)).toEqual([
      { label: "Opens", words: "1" },
      { label: "First open signed", words: "Yes" },
      { label: "Location", words: "719 m from the delivery address" },
      { label: "Later share", words: "40 m from the delivery address" },
    ]);
    expect(JSON.stringify(elementLines(open))).not.toMatch(/accuracy|lat|lng/);
  });

  it("gives the order row its location word", () => {
    expect(locationWordOf(record)).toBe("719 m from the delivery address");
    const say = (verdict: string) =>
      locationWordOf({
        ...record,
        elements: [
          {
            element: "the_open",
            label: "The open",
            status: "verified",
            value: { location: { verdict } },
          },
        ],
      });
    expect(say("pass")).toBe("Distance unavailable");
    expect(say("near")).toBe("Distance unavailable");
    expect(say("not_shared")).toBe("Location not shared");
    expect(say("imprecise")).toBe("Location accuracy too low to measure");
    expect(locationWordOf(null)).toBe("");
  });
});
