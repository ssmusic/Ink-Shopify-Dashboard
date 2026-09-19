// pdf-lite — a text PDF, written by hand, so the audit report can leave as a
// real .pdf without a PDF library in the server bundle. Ported from
// the-ritualist's src/lib/pdf-lite.ts (the order-record export, #1317) with
// one addition: a line may carry filled RECTANGLES (a QR code's modules as
// vector squares), drawn beside the text column.
//
// WHY NOT A LIBRARY. A report is a few pages of labelled lines and a
// monospaced appendix: the standard 14 fonts (every reader ships them),
// absolute positioning, pagination, and now squares. ~180 lines of PDF 1.4,
// deterministic and testable. WHAT IT CANNOT DO, ON PURPOSE: no images, no
// embedded fonts, no Unicode beyond Latin-1 (folded to "?"). Letter, portrait.

export type PdfFont = "sans" | "sans-bold" | "mono";

export interface PdfRect {
  /** Offset from the text column's left edge, in points. */
  x: number;
  /** Offset DOWN from this line's baseline, in points. */
  y: number;
  w: number;
  h: number;
}

export interface PdfLine {
  text: string;
  font?: PdfFont;
  /** Point size; default 10. */
  size?: number;
  /** Extra space ABOVE this line, in points (a section gap). */
  gap?: number;
  /** Filled black rectangles drawn relative to this line; the line reserves
   *  `reserve` points of height below itself for them. */
  rects?: PdfRect[];
  reserve?: number;
}

const PAGE_W = 612;
const PAGE_H = 792;
const MARGIN_X = 48;
const MARGIN_TOP = 56;
const MARGIN_BOTTOM = 56;
const LEADING = 1.4;

const FONT_RESOURCE: Record<PdfFont, string> = { sans: "/F1", "sans-bold": "/F2", mono: "/F3" };

const TYPOGRAPHY_FOLD: Record<string, string> = {
  "—": "-", "–": "-", "‘": "'", "’": "'", "“": '"', "”": '"', "…": "...", " ": " ",
  "·": "-",
};

export function pdfEscape(text: string): string {
  let out = "";
  for (const ch of text) {
    const folded = TYPOGRAPHY_FOLD[ch];
    if (folded !== undefined) { out += folded; continue; }
    const code = ch.codePointAt(0) ?? 63;
    if (ch === "\\" || ch === "(" || ch === ")") out += `\\${ch}`;
    else if (code === 10 || code === 13 || code === 9) out += " ";
    else if (code < 32 || code > 255) out += "?";
    else out += ch;
  }
  return out;
}

function lineHeight(line: PdfLine, first: boolean): number {
  const size = line.size ?? 10;
  return size * LEADING + (first ? 0 : line.gap ?? 0) + (line.reserve ?? 0);
}

function paginate(lines: PdfLine[]): PdfLine[][] {
  const pages: PdfLine[][] = [];
  let page: PdfLine[] = [];
  let y = PAGE_H - MARGIN_TOP;
  for (const line of lines) {
    const advance = lineHeight(line, page.length === 0);
    if (page.length && y - advance < MARGIN_BOTTOM) {
      pages.push(page);
      page = [];
      y = PAGE_H - MARGIN_TOP;
    }
    y -= page.length ? advance : (line.size ?? 10) * LEADING + (line.reserve ?? 0);
    page.push(line);
  }
  if (page.length || !pages.length) pages.push(page);
  return pages;
}

function contentStream(page: PdfLine[]): string {
  const ops: string[] = [];
  let y = PAGE_H - MARGIN_TOP;
  page.forEach((line, i) => {
    const size = line.size ?? 10;
    const gap = i ? line.gap ?? 0 : 0;
    y -= size * LEADING + gap;
    const font = FONT_RESOURCE[line.font ?? "sans"];
    ops.push(`BT ${font} ${size} Tf ${MARGIN_X} ${y.toFixed(2)} Td (${pdfEscape(line.text)}) Tj ET`);
    for (const r of line.rects ?? []) {
      const rx = MARGIN_X + r.x;
      const ry = y - r.y - r.h;
      ops.push(`${rx.toFixed(2)} ${ry.toFixed(2)} ${r.w.toFixed(2)} ${r.h.toFixed(2)} re f`);
    }
    y -= line.reserve ?? 0;
  });
  return ops.join("\n");
}

/** Build the PDF bytes. Every object is Latin-1 text, so the byte offsets the
 *  cross-reference table needs are plain string lengths. */
export function buildTextPdf(lines: PdfLine[], meta?: { title?: string; producer?: string }): Uint8Array {
  const pages = paginate(lines);
  const objects: string[] = [];
  const firstPageObj = 7;
  const pageIds = pages.map((_, i) => firstPageObj + i * 2);

  objects[1] = "<< /Type /Catalog /Pages 2 0 R >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  objects[3] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>";
  objects[4] = "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>";
  objects[5] = "<< /Type /Font /Subtype /Type1 /BaseFont /Courier /Encoding /WinAnsiEncoding >>";
  objects[6] = `<< /Producer (${pdfEscape(meta?.producer ?? "ink")}) ${meta?.title ? `/Title (${pdfEscape(meta.title)})` : ""} >>`;

  pages.forEach((page, i) => {
    const pageId = firstPageObj + i * 2;
    const contentId = pageId + 1;
    const stream = contentStream(page);
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 3 0 R /F2 4 0 R /F3 5 0 R >> >> /Contents ${contentId} 0 R >>`;
    objects[contentId] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });

  let out = "%PDF-1.4\n%\xE2\xE3\xCF\xD3\n";
  const offsets: number[] = [];
  for (let id = 1; id < objects.length; id += 1) {
    offsets[id] = out.length;
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`;
  }
  const xrefAt = out.length;
  const count = objects.length;
  out += `xref\n0 ${count}\n0000000000 65535 f \n`;
  for (let id = 1; id < count; id += 1) out += `${String(offsets[id]).padStart(10, "0")} 00000 n \n`;
  out += `trailer\n<< /Size ${count} /Root 1 0 R /Info 6 0 R >>\nstartxref\n${xrefAt}\n%%EOF\n`;

  const bytes = new Uint8Array(out.length);
  for (let i = 0; i < out.length; i += 1) bytes[i] = out.charCodeAt(i) & 0xff;
  return bytes;
}

/** Wrap a long token (a hash, a signature) at `width` characters. */
export function wrapToken(token: string, width: number): string[] {
  const out: string[] = [];
  for (let i = 0; i < token.length; i += width) out.push(token.slice(i, i + width));
  return out.length ? out : [""];
}

/** Word-wrap prose to `maxChars` per line (Helvetica averages ~0.5 em per
 *  character; callers pick the width for their size). */
export function wrapWords(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    if (!cur) { cur = w; continue; }
    if (cur.length + 1 + w.length <= maxChars) cur += ` ${w}`;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}
