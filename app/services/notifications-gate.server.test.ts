// THE UNGATED RAIL, GATED — and proven to have been ungated.
//
// state-email.server.ts refuses to email a real customer from a test-flagged
// merchant and honors SEND_ALLOWLIST. NotificationService — the rail behind
// every toggle on the Notifications page — had NONE of those guards
// (audit 2026-08-07): a returns_test_mode store with delivery.delivered=true
// would have plain-text-emailed a real buyer. `notificationSendAllowed` is
// the shared gate; dispatch consults it before any transport.

import { afterEach, describe, expect, it } from "vitest";
import { notificationSendAllowed } from "./notifications.server";

const ORIGINAL_ALLOWLIST = process.env.SEND_ALLOWLIST;

afterEach(() => {
  if (ORIGINAL_ALLOWLIST === undefined) delete process.env.SEND_ALLOWLIST;
  else process.env.SEND_ALLOWLIST = ORIGINAL_ALLOWLIST;
});

describe("notificationSendAllowed", () => {
  it("a test-flagged merchant never reaches a real customer", () => {
    delete process.env.SEND_ALLOWLIST;
    expect(
      notificationSendAllowed({ returns_test_mode: true }, "realbuyer@example.com"),
    ).toBe(false);
    expect(notificationSendAllowed({ is_test: true }, "realbuyer@example.com")).toBe(false);
  });

  it("an allowlisted recipient is reachable even from a test merchant — how we demo", () => {
    process.env.SEND_ALLOWLIST = "realprops@gmail.com, other@x.com";
    expect(
      notificationSendAllowed({ returns_test_mode: true }, "realprops@gmail.com"),
    ).toBe(true);
    // case-insensitive, trimmed
    expect(
      notificationSendAllowed({ returns_test_mode: true }, "  RealProps@Gmail.com "),
    ).toBe(true);
  });

  it("a non-empty allowlist excludes everyone not on it, test merchant or not", () => {
    process.env.SEND_ALLOWLIST = "only@me.com";
    expect(notificationSendAllowed({}, "someone@else.com")).toBe(false);
    expect(notificationSendAllowed({}, "only@me.com")).toBe(true);
  });

  it("a clean merchant with no allowlist sends", () => {
    delete process.env.SEND_ALLOWLIST;
    expect(notificationSendAllowed({}, "buyer@example.com")).toBe(true);
  });

  it("no merchant data fails CLOSED — never charge ahead blind", () => {
    delete process.env.SEND_ALLOWLIST;
    expect(notificationSendAllowed(undefined, "buyer@example.com")).toBe(false);
    expect(notificationSendAllowed(null, "buyer@example.com")).toBe(false);
  });

  it("no recipient fails closed", () => {
    delete process.env.SEND_ALLOWLIST;
    expect(notificationSendAllowed({}, undefined)).toBe(false);
    expect(notificationSendAllowed({}, "")).toBe(false);
  });
});
