import { elementLines, LEVEL_WORDS, type RecordRead } from "../lib/record-words";
import type { InkInspection } from "../lib/ink-record-inspection";

// Quote every cell and neutralize spreadsheet formulas in merchant-supplied values.
const cell = (value: unknown) => {
  const raw = String(value ?? "").replace(/[\r\n]+/g, " ");
  const safe = /^[\t\s]*[=+@-]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
};
const row = (...values: unknown[]) => values.map(cell).join(",");
const point = (value: { lat: number; lng: number } | null) =>
  value ? `${value.lat.toFixed(4)}, ${value.lng.toFixed(4)}` : "Not shared";

/** A spreadsheet-friendly index. JSON retains the exact signed bytes. */
export function buildInkRecordCsv(
  record: RecordRead,
  inspection: InkInspection,
): string {
  const lines = [row("Section", "Item", "Field", "Value")];
  lines.push(
    row(
      "Record",
      inspection.proofId,
      "Order",
      record.summary.order_number ?? "Unavailable",
    ),
  );
  lines.push(
    row(
      "Record",
      inspection.proofId,
      "Opens",
      record.summary.opens ?? "Unavailable",
    ),
  );
  for (const element of record.elements) {
    lines.push(
      // The level in the screen's words: the raw `verified` read as a claim
      // that ink verified the delivery place (Sam, 2026-09-24: "we cant
      // confirm at door").
      row("Evidence", element.label, "Status reported by ink", LEVEL_WORDS[element.status] || element.status),
    );
    for (const line of elementLines(element, record))
      lines.push(row("Evidence", element.label, line.label, line.words));
  }
  if (inspection.opens == null)
    lines.push(
      row(
        "Open history",
        "",
        "Availability",
        "Unavailable from the merchant service",
      ),
    );
  else
    inspection.opens.forEach((open, index) => {
      const label = `Open ${index + 1}`;
      lines.push(row("Open history", label, "Time", open.at ?? "Unavailable"));
      lines.push(
        row(
          "Open history",
          label,
          "Distance from delivery address (m)",
          open.distanceM ?? "Unavailable",
        ),
      );
      lines.push(
        row(
          "Open history",
          label,
          "Location accuracy (m)",
          open.accuracyM ?? "Unavailable",
        ),
      );
      lines.push(row("Open history", label, "Location", point(open.location)));
    });
  if (inspection.opensCapped)
    lines.push(row("Open history", "", "Availability", "Limited by the merchant service; this is not the complete open history"));
  for (const event of inspection.events) {
    const name = event.id;
    for (const [field, value] of [
      ["Type", event.type],
      ["Time", event.at],
      ["Sequence", event.sequence],
      ["Earlier event", event.legacy],
      ["Key ID", event.keyId],
      ["Payload hash", event.payloadHash],
      ["Previous event ID", event.previousEventId],
      ["Previous hash", event.previousHash],
      ["Signature supplied by ink", event.signature],
      ["Location", point(event.location)],
      ["Signed bytes supplied", event.signedBytes != null],
      ["Stored bytes reported unverifiable by ink", event.unverifiable],
    ] as [string, unknown][])
      lines.push(row("Event", name, field, value));
  }
  lines.push(
    row(
      "Notice",
      "",
      "Verification",
      "CSV and PDF report ink's data. The JSON contains exact signed bytes. This CSV does not independently verify signatures.",
    ),
  );
  return `\uFEFF${lines.join("\r\n")}\r\n`;
}
