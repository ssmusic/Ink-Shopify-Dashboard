import { afterEach, describe, expect, it, vi } from "vitest";

const flags = vi.hoisted(() => ({ FEATURE_NFC: false, FEATURE_NOTIFICATIONS: false }));
vi.mock("../flags", () => flags);
const { collectsCustomerPhone } = await import("./customer-phone.server");

afterEach(() => {
  flags.FEATURE_NFC = false;
  flags.FEATURE_NOTIFICATIONS = false;
  vi.unstubAllEnvs();
});

describe("customer phone is collected only for an enabled consumer", () => {
  for (const flavor of ["ink", "ritualist"]) {
    for (const nfc of [false, true]) {
      for (const notifications of [false, true]) {
        it(`${flavor}, hardware=${nfc}, notifications=${notifications}`, () => {
          vi.stubEnv("APP_FLAVOR", flavor);
          flags.FEATURE_NFC = nfc;
          flags.FEATURE_NOTIFICATIONS = notifications;
          expect(collectsCustomerPhone()).toBe(flavor === "ritualist" && (nfc || notifications));
        });
      }
    }
  }
});
