// THE BUYER'S EMAIL AND TEXT SAY NOTHING WAS CONFIRMED (Sam, 2026-09-24, on
// "Delivery confirmed" / "Confirmed on arrival": "wrong"). The words that
// replace them are PLACEHOLDER; what this holds is that the sent message —
// every template the arrived state can take — never says a delivery was
// confirmed or verified. The send path and its gates are untouched.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const sent: Array<{ subject: string; text: string; html: string }> = [];

vi.mock("@sendgrid/mail", () => ({
  default: {
    setApiKey: vi.fn(),
    send: vi.fn(async (message: { subject: string; text: string; html: string }) => {
      sent.push(message);
      return [{ statusCode: 202 }];
    }),
  },
}));

const VERDICT = /confirm|verif/i;

describe("the arrived email", () => {
  beforeEach(() => {
    sent.length = 0;
    vi.resetModules();
    vi.stubEnv("SENDGRID_API_KEY", "SG.test");
    vi.stubEnv("SENDGRID_FROM_EMAIL", "notifications@in.ink");
  });
  afterEach(() => vi.unstubAllEnvs());

  const base = {
    to: "buyer@example.com",
    customerName: "Nina",
    orderName: "#1042",
    proofUrl: "https://brand.in.ink/r/nfc_x",
    merchantName: "Brand",
  };

  it("the plain template (no brand kit) says it arrived, and nothing more", async () => {
    const { EmailService } = await import("./email.server");
    expect(await EmailService.sendReturnPassportEmail(base)).toBe(true);
    const [m] = sent;
    expect(m.html).toContain("has arrived.");
    expect(m.html).not.toMatch(VERDICT);
    expect(m.text).toBe("Your Brand order #1042 has arrived. Your receipt + returns: https://brand.in.ink/r/nfc_x");
    expect(m.subject).not.toMatch(VERDICT);
  });

  it("the branded template says no verdict either", async () => {
    const { EmailService } = await import("./email.server");
    const brand = { ink: "#101010", logoUrl: null, heroUrl: null } as never;
    expect(await EmailService.sendReturnPassportEmail({ ...base, brand })).toBe(true);
    const [m] = sent;
    expect(m.html).toContain("Order #1042 · Arrived");
    expect(m.html).not.toMatch(VERDICT);
  });

  it("the shipped state keeps its own words", async () => {
    const { EmailService } = await import("./email.server");
    await EmailService.sendReturnPassportEmail({ ...base, state: "shipped" });
    expect(sent[0].html).toContain("With the carrier");
    expect(sent[0].html).not.toMatch(VERDICT);
  });
});

describe("the text after the door notification", () => {
  it("reuses the delivered text's own sentence and says no verdict", async () => {
    const source = await import("node:fs").then((fs) =>
      fs.readFileSync(new URL("./notifications.server.ts", import.meta.url), "utf8"),
    );
    const branch = source.match(/case "deliveryConfirmed":\s*\n([\s\S]*?)break;/)?.[1] ?? "";
    const body = branch.match(/messageBody = `([^`]*)`/)?.[1] ?? "";
    // The words, without the code interpolated into them (`verifyUrl`).
    const words = body.replace(/\$\{[^}]*\}?/g, "");
    expect(words).toBe("Your  order  has arrived.");
    expect(words).not.toMatch(VERDICT);
    // The old line as code (a backtick template), not as the comment that quotes it.
    expect(source).not.toMatch(/`Delivery confirmed for your \$\{/);
  });
});
