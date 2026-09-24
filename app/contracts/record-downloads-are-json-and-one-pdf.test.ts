// THE RECORD DOWNLOADS AS JSON AND ONE PDF (Sam, 2026-09-24: "csv is maybe
// unnecessary" … "just use json"). Both flavors. The signed JSON is the
// record; the one-page PDF stays because Shopify's dispute form takes no
// JSON. No CSV and no multi-page audit report may come back (#187).
import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const root = join(__dirname, "..");
const files = (dir: string): string[] =>
  readdirSync(join(root, dir)).flatMap((name) => {
    const rel = join(dir, name);
    return statSync(join(root, rel)).isDirectory() ? files(rel) : [rel];
  });
const source = [...files("components"), ...files("routes"), ...files("services"), ...files("lib")]
  .filter((f) => /\.(ts|tsx)$/.test(f) && !/\.test\.tsx?$/.test(f));

describe("the record downloads as JSON and one PDF", () => {
  it("no audit-report route, builder, or CSV builder exists", () => {
    for (const gone of ["routes/app.api.orders.$orderId.audit-report.tsx", "services/audit-report.server.ts", "services/ink-record-csv.server.ts"]) {
      expect(existsSync(join(root, gone)), gone).toBe(false);
    }
  });

  it("no screen offers a CSV or the audit report, and no route accepts a csv intent", () => {
    for (const f of source) {
      const text = readFileSync(join(root, f), "utf8");
      expect(text, f).not.toMatch(/Download CSV|Audit report \(PDF\)|auditReportHref|buildInkRecordCsv/);
      expect(text, f).not.toMatch(/new Set\(\[[^\]]*"csv"/);
    }
  });

  it("the JSON and the one-page PDF are still offered", () => {
    const door = readFileSync(join(root, "components/InkRecordDoor.tsx"), "utf8");
    expect(door).toContain("Download record (JSON)");
    expect(door).toContain("Download PDF");
    expect(readFileSync(join(root, "components/VerifiableRecordCard.tsx"), "utf8")).toContain("Export the record (JSON)");
  });
});
