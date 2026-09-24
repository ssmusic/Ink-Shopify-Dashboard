// pdf-lite — a text PDF written by hand, now PDF/A-1b (2026-09-24).
//
// WHY PDF/A. Shopify's dispute form takes PDF, JPEG or PNG, 2 MB a file and
// 4 MB in all, and asks for PDF/A (Help Center, "Managing chargebacks in the
// Shopify admin", read 2026-09-24); banks may receive it by fax. The old
// writer named the standard 14 fonts (Helvetica, Courier) without embedding
// them and carried no PDF/A metadata (RECORD-DISPUTE-REPORT-2026-09-24).
//
// WHAT PDF/A-1b NEEDS, AND WHERE IT IS BELOW:
//   · every font program embedded, its widths agreeing with the program —
//     Lato and Source Code Pro (SIL OFL 1.1, pdf-fonts.server.ts), TrueType,
//     WinAnsiEncoding, /Widths read from the font's own hmtx;
//   · an output intent with an ICC profile for the device colour used — a
//     grey monitor profile (gamma 2.2) generated here, and every mark drawn
//     in DeviceGray;
//   · XMP metadata declaring pdfaid part 1, conformance B, agreeing with the
//     Info dictionary; a trailer /ID; no encryption, no transparency, no
//     JavaScript, no links.
// Bold is the regular face drawn with a hairline stroke (text render mode 2):
// one font program fewer, and PDF/A allows it.
//
// The same file is the-ritualist src/lib/pdf-lite.ts: a record PDF reads the
// same in ink and in The Ritualist (Sam, 2026-09-24).
//
// WHAT IT CANNOT DO, ON PURPOSE: no images, no Unicode beyond WinAnsi
// (folded to "?"). Letter, portrait.

import { LATO_REGULAR_TTF, SOURCE_CODE_PRO_REGULAR_TTF } from "./pdf-fonts.server";

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

export interface PdfMeta {
  title?: string;
  producer?: string;
  /** The document's date (ISO). Default now; tests pass one for byte-stable output. */
  date?: string;
}

export const PAGE_W = 612;
export const PAGE_H = 792;
export const MARGIN_X = 44;
const MARGIN_TOP = 40;
const MARGIN_BOTTOM = 40;
const LEADING = 1.4;
/** The text column's width, in points. */
export const COLUMN_W = PAGE_W - MARGIN_X * 2;

// ── Bytes ───────────────────────────────────────────────────────────────

function fromBase64(b64: string): Uint8Array {
  if (typeof atob === "function") {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i += 1) out[i] = bin.charCodeAt(i);
    return out;
  }
  // Node without atob (older runtimes).
  const B = (globalThis as unknown as { Buffer: { from(s: string, e: string): Uint8Array } }).Buffer;
  return new Uint8Array(B.from(b64, "base64"));
}

/** Bytes as a Latin-1 string: every byte one char, so string lengths are byte offsets. */
function latin1(bytes: Uint8Array): string {
  let out = "";
  for (let i = 0; i < bytes.length; i += 8192) out += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return out;
}

const u16 = (d: Uint8Array, o: number) => (d[o] << 8) | d[o + 1];
const i16 = (d: Uint8Array, o: number) => { const v = u16(d, o); return v & 0x8000 ? v - 0x10000 : v; };
const u32 = (d: Uint8Array, o: number) => ((d[o] << 24) >>> 0) + (d[o + 1] << 16) + (d[o + 2] << 8) + d[o + 3];

// ── The fonts ───────────────────────────────────────────────────────────

/** WinAnsiEncoding's 0x80–0x9F, as Unicode (PDF 1.7 Annex D); 0 = unused. */
const WIN_ANSI_HIGH = [
  0x20ac, 0, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0, 0x017d, 0,
  0, 0x2018, 0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0, 0x017e, 0x0178,
];
const unicodeOfCode = (code: number): number => (code >= 0x80 && code <= 0x9f ? WIN_ANSI_HIGH[code - 0x80] : code);

type FontProgram = {
  name: string;
  bytes: Uint8Array;
  unitsPerEm: number;
  bbox: [number, number, number, number];
  ascent: number;
  descent: number;
  capHeight: number;
  italicAngle: number;
  fixedPitch: boolean;
  /** Width in 1000ths of an em for WinAnsi codes 32..255; null = no glyph. */
  widths: (number | null)[];
};

function readFont(name: string, b64: string): FontProgram {
  const d = fromBase64(b64);
  const numTables = u16(d, 4);
  const tables: Record<string, number> = {};
  for (let i = 0; i < numTables; i += 1) {
    const rec = 12 + i * 16;
    tables[String.fromCharCode(d[rec], d[rec + 1], d[rec + 2], d[rec + 3])] = u32(d, rec + 8);
  }
  const head = tables.head;
  const unitsPerEm = u16(d, head + 18);
  const scale = (v: number) => Math.round((v * 1000) / unitsPerEm);
  const bbox: [number, number, number, number] = [i16(d, head + 36), i16(d, head + 38), i16(d, head + 40), i16(d, head + 42)].map(scale) as [number, number, number, number];
  const hhea = tables.hhea;
  const ascent = scale(i16(d, hhea + 4));
  const descent = scale(i16(d, hhea + 6));
  const numberOfHMetrics = u16(d, hhea + 34);
  const hmtx = tables.hmtx;
  const advanceOf = (gid: number) => u16(d, hmtx + 4 * Math.min(gid, numberOfHMetrics - 1));
  const os2 = tables["OS/2"];
  const capHeight = os2 && u16(d, os2) >= 2 ? scale(i16(d, os2 + 88)) : Math.round(ascent * 0.7);
  const post = tables.post;
  const italicAngle = post ? i16(d, post + 4) + u16(d, post + 6) / 65536 : 0;
  const fixedPitch = post ? u32(d, post + 12) !== 0 : false;

  // cmap (3,1) format 4: Unicode BMP → glyph id.
  const cmap = tables.cmap;
  let sub = -1;
  for (let i = 0; i < u16(d, cmap + 2); i += 1) {
    const rec = cmap + 4 + i * 8;
    if (u16(d, rec) === 3 && u16(d, rec + 2) === 1) sub = cmap + u32(d, rec + 4);
  }
  if (sub < 0 || u16(d, sub) !== 4) throw new Error(`${name}: no (3,1) format 4 cmap`);
  const segX2 = u16(d, sub + 6);
  const ends = sub + 14;
  const starts = ends + segX2 + 2;
  const deltas = starts + segX2;
  const offsets = deltas + segX2;
  const glyphOf = (cp: number): number => {
    for (let s = 0; s < segX2; s += 2) {
      const end = u16(d, ends + s);
      if (cp > end) continue;
      const start = u16(d, starts + s);
      if (cp < start) return 0;
      const delta = u16(d, deltas + s);
      const ro = u16(d, offsets + s);
      if (ro === 0) return (cp + delta) & 0xffff;
      const g = u16(d, offsets + s + ro + 2 * (cp - start));
      return g === 0 ? 0 : (g + delta) & 0xffff;
    }
    return 0;
  };
  const widths: (number | null)[] = [];
  for (let code = 32; code <= 255; code += 1) {
    const cp = unicodeOfCode(code);
    const gid = cp && code !== 127 ? glyphOf(cp) : 0;
    widths.push(gid ? scale(advanceOf(gid)) : null);
  }
  return { name, bytes: d, unitsPerEm, bbox, ascent, descent, capHeight, italicAngle, fixedPitch, widths };
}

let fontsCache: { sans: FontProgram; mono: FontProgram } | null = null;
function fonts() {
  if (!fontsCache) fontsCache = { sans: readFont("Lato-Regular", LATO_REGULAR_TTF), mono: readFont("SourceCodePro-Regular", SOURCE_CODE_PRO_REGULAR_TTF) };
  return fontsCache;
}
const programOf = (font: PdfFont) => (font === "mono" ? fonts().mono : fonts().sans);

// ── Text ────────────────────────────────────────────────────────────────

// Typography that has a WinAnsi code keeps it; a few fold to plain forms.
const TYPOGRAPHY: Record<string, number> = {
  "—": 0x97, "–": 0x96, "‘": 0x91, "’": 0x92, "“": 0x93, "”": 0x94, "…": 0x85, "•": 0x95, "€": 0x80, "™": 0x99,
};
const FOLD: Record<string, string> = { " ": " ", " ": " ", "→": "->", "←": "<-", "✓": "v", "≈": "~" };

/** Text → WinAnsi codes the font can draw; anything else is "?". */
function codesOf(text: string, font: PdfFont): number[] {
  const program = programOf(font);
  const out: number[] = [];
  for (const raw of text) {
    for (const ch of FOLD[raw] ?? raw) {
      let code = TYPOGRAPHY[ch] ?? ch.codePointAt(0) ?? 63;
      if (code === 10 || code === 13 || code === 9) code = 32;
      const drawable = code >= 32 && code <= 255 && program.widths[code - 32] != null;
      out.push(drawable ? code : 63);
    }
  }
  return out;
}

/** A PDF string literal's body for these codes. */
function literal(codes: number[]): string {
  let out = "";
  for (const c of codes) {
    if (c === 0x5c || c === 0x28 || c === 0x29) out += `\\${String.fromCharCode(c)}`;
    else out += String.fromCharCode(c);
  }
  return out;
}

/** Kept for callers that escape text themselves (the Info title). */
export function pdfEscape(text: string): string {
  return literal(codesOf(text, "sans"));
}

/** The width of a line of text in points. */
export function measure(text: string, font: PdfFont = "sans", size = 10): number {
  const w = programOf(font).widths;
  return codesOf(text, font).reduce((sum, c) => sum + (w[c - 32] ?? 0), 0) * (size / 1000);
}

/** Word-wrap prose to a width in points (measured with the real font). */
export function wrapToWidth(text: string, font: PdfFont, size: number, width = COLUMN_W): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const next = cur ? `${cur} ${w}` : w;
    if (!cur || measure(next, font, size) <= width) cur = next;
    else { lines.push(cur); cur = w; }
  }
  if (cur) lines.push(cur);
  return lines.length ? lines : [""];
}

// ── Pages ───────────────────────────────────────────────────────────────

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
  // Every mark in DeviceGray, black: the output intent is a grey profile.
  const ops: string[] = ["0 g 0 G"];
  let y = PAGE_H - MARGIN_TOP;
  page.forEach((line, i) => {
    const size = line.size ?? 10;
    const gap = i ? line.gap ?? 0 : 0;
    y -= size * LEADING + gap;
    const font = line.font ?? "sans";
    const resource = font === "mono" ? "/F2" : "/F1";
    const bold = font === "sans-bold" ? ` 2 Tr ${(size * 0.045).toFixed(3)} w` : "";
    ops.push(`BT ${resource} ${size} Tf${bold} ${MARGIN_X} ${y.toFixed(2)} Td (${literal(codesOf(line.text, font))}) Tj ET`);
    for (const r of line.rects ?? []) {
      const rx = MARGIN_X + r.x;
      const ry = y - r.y - r.h;
      ops.push(`${rx.toFixed(2)} ${ry.toFixed(2)} ${r.w.toFixed(2)} ${r.h.toFixed(2)} re f`);
    }
    y -= line.reserve ?? 0;
  });
  return ops.join("\n");
}

// ── The grey output intent's ICC profile (ICC.1:2001, version 2.1) ───────
// A monitor-class GRAY profile: description, copyright, the D50 white point
// and a gamma 2.2 tone curve. Generated, so no third party's profile ships.

function greyIccProfile(): Uint8Array {
  const text = (s: string) => Array.from(s, (c) => c.charCodeAt(0));
  const be32 = (v: number) => [(v >>> 24) & 255, (v >>> 16) & 255, (v >>> 8) & 255, v & 255];
  const be16 = (v: number) => [(v >>> 8) & 255, v & 255];
  const pad4 = (b: number[]) => { while (b.length % 4) b.push(0); return b; };
  const desc = (() => {
    const s = "ink grey, gamma 2.2";
    return pad4([...text("desc"), 0, 0, 0, 0, ...be32(s.length + 1), ...text(s), 0, ...be32(0), ...be32(0), ...be16(0), 0, ...new Array(67).fill(0)]);
  })();
  const cprt = pad4([...text("text"), 0, 0, 0, 0, ...text("No copyright; generated by ink"), 0]);
  const wtpt = [...text("XYZ "), 0, 0, 0, 0, ...be32(0x0000f6d6), ...be32(0x00010000), ...be32(0x0000d32d)];
  const ktrc = pad4([...text("curv"), 0, 0, 0, 0, ...be32(1), ...be16(0x0233)]);
  const tags: [string, number[]][] = [["desc", desc], ["cprt", cprt], ["wtpt", wtpt], ["kTRC", ktrc]];
  const tableSize = 4 + tags.length * 12;
  let offset = 128 + tableSize;
  const table: number[] = [...be32(tags.length)];
  const data: number[] = [];
  for (const [sig, bytes] of tags) {
    table.push(...text(sig), ...be32(offset), ...be32(bytes.length));
    data.push(...bytes);
    offset += bytes.length;
  }
  const size = 128 + tableSize + data.length;
  const header = [
    ...be32(size), 0, 0, 0, 0, // size, preferred CMM
    0x02, 0x10, 0, 0, // version 2.1.0
    ...text("mntr"), ...text("GRAY"), ...text("XYZ "),
    ...be16(2026), ...be16(1), ...be16(1), 0, 0, 0, 0, 0, 0, // date
    ...text("acsp"), 0, 0, 0, 0, // signature, platform
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, // flags, manufacturer, model
    0, 0, 0, 0, 0, 0, 0, 0, // attributes
    0, 0, 0, 0, // rendering intent: perceptual
    ...be32(0x0000f6d6), ...be32(0x00010000), ...be32(0x0000d32d), // PCS illuminant D50
    0, 0, 0, 0, // creator
  ];
  while (header.length < 128) header.push(0);
  return new Uint8Array([...header, ...table, ...data]);
}

// ── The document ────────────────────────────────────────────────────────

/** A string's bytes, hashed small and deterministic, as 32 hex (the /ID). */
function idHex(s: string): string {
  let h1 = 0x811c9dc5, h2 = 0x01000193, h3 = 0x9e3779b9, h4 = 0x85ebca6b;
  for (let i = 0; i < s.length; i += 1) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193); h2 = Math.imul(h2 ^ c, 0x5bd1e995);
    h3 = Math.imul(h3 ^ c, 0x27d4eb2d); h4 = Math.imul(h4 ^ c, 0x165667b1);
  }
  return [h1, h2, h3, h4].map((h) => (h >>> 0).toString(16).padStart(8, "0")).join("");
}

const xmlEscape = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const asciiOnly = (s: string) => s.replace(/[^\x20-\x7e]/g, "?");

function fontObjects(program: FontProgram, fileId: number, descriptorId: number) {
  const file = latin1(program.bytes);
  const flags = 32 | (program.fixedPitch ? 1 : 0); // nonsymbolic (+ fixed pitch)
  const fontFile = `<< /Length ${file.length} /Length1 ${file.length} >>\nstream\n${file}\nendstream`;
  const descriptor =
    `<< /Type /FontDescriptor /FontName /${program.name} /Flags ${flags} /FontBBox [${program.bbox.join(" ")}] ` +
    `/ItalicAngle ${program.italicAngle} /Ascent ${program.ascent} /Descent ${program.descent} /CapHeight ${program.capHeight} ` +
    `/StemV 80 /FontFile2 ${fileId} 0 R >>`;
  const widths = program.widths.map((w) => w ?? 0).join(" ");
  const dict = (descId: number) =>
    `<< /Type /Font /Subtype /TrueType /BaseFont /${program.name} /FirstChar 32 /LastChar 255 ` +
    `/Widths [${widths}] /Encoding /WinAnsiEncoding /FontDescriptor ${descId} 0 R >>`;
  return { fontFile, descriptor, dict: dict(descriptorId) };
}

/** Build the PDF/A-1b bytes. Every object is Latin-1 text, so the byte
 *  offsets the cross-reference table needs are plain string lengths. */
export function buildTextPdf(lines: PdfLine[], meta?: PdfMeta): Uint8Array {
  const pages = paginate(lines);
  const date = new Date(meta?.date && Number.isFinite(Date.parse(meta.date)) ? meta.date : Date.now());
  const iso = `${date.toISOString().slice(0, 19)}Z`;
  const pdfDate = `D:${iso.slice(0, 19).replace(/[-:T]/g, "")}Z`;
  const title = asciiOnly(meta?.title ?? "ink record");
  const producer = asciiOnly(meta?.producer ?? "ink");
  const { sans, mono } = fonts();

  const objects: string[] = [];
  // 1 catalog · 2 pages · 3 XMP · 4 output intent · 5 ICC · 6 info ·
  // 7–9 sans (file, descriptor, font) · 10–12 mono · 13… pages.
  const firstPageObj = 13;
  const pageIds = pages.map((_, i) => firstPageObj + i * 2);
  objects[1] = "<< /Type /Catalog /Pages 2 0 R /Metadata 3 0 R /OutputIntents [4 0 R] >>";
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
  const xmp = [
    '<?xpacket begin="\xEF\xBB\xBF" id="W5M0MpCehiHzreSzNTczkc9d"?>',
    '<x:xmpmeta xmlns:x="adobe:ns:meta/">',
    '<rdf:RDF xmlns:rdf="http://www.w3.org/1999/02/22-rdf-syntax-ns#">',
    '<rdf:Description rdf:about="" xmlns:pdfaid="http://www.aiim.org/pdfa/ns/id/" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:pdf="http://ns.adobe.com/pdf/1.3/" xmlns:xmp="http://ns.adobe.com/xap/1.0/">',
    "<pdfaid:part>1</pdfaid:part>",
    "<pdfaid:conformance>B</pdfaid:conformance>",
    `<dc:title><rdf:Alt><rdf:li xml:lang="x-default">${xmlEscape(title)}</rdf:li></rdf:Alt></dc:title>`,
    "<dc:format>application/pdf</dc:format>",
    `<pdf:Producer>${xmlEscape(producer)}</pdf:Producer>`,
    `<xmp:CreateDate>${iso}</xmp:CreateDate>`,
    `<xmp:ModifyDate>${iso}</xmp:ModifyDate>`,
    "</rdf:Description>",
    "</rdf:RDF>",
    "</x:xmpmeta>",
    '<?xpacket end="w"?>',
  ].join("\n");
  objects[3] = `<< /Type /Metadata /Subtype /XML /Length ${xmp.length} >>\nstream\n${xmp}\nendstream`;
  objects[4] = "<< /Type /OutputIntent /S /GTS_PDFA1 /OutputConditionIdentifier (ink grey gamma 2.2) /Info (ink grey gamma 2.2) /DestOutputProfile 5 0 R >>";
  const icc = latin1(greyIccProfile());
  objects[5] = `<< /N 1 /Length ${icc.length} >>\nstream\n${icc}\nendstream`;
  objects[6] = `<< /Title (${literal(Array.from(title, (c) => c.charCodeAt(0)))}) /Producer (${literal(Array.from(producer, (c) => c.charCodeAt(0)))}) /CreationDate (${pdfDate}) /ModDate (${pdfDate}) >>`;
  const s = fontObjects(sans, 7, 8);
  objects[7] = s.fontFile; objects[8] = s.descriptor; objects[9] = s.dict;
  const m = fontObjects(mono, 10, 11);
  objects[10] = m.fontFile; objects[11] = m.descriptor; objects[12] = m.dict;

  pages.forEach((page, i) => {
    const pageId = firstPageObj + i * 2;
    const contentId = pageId + 1;
    const stream = contentStream(page);
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] ` +
      `/Resources << /Font << /F1 9 0 R /F2 12 0 R >> >> /Contents ${contentId} 0 R >>`;
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
  const id = idHex(`${title}|${iso}|${pages.map(contentStream).join("|")}`);
  out += `trailer\n<< /Size ${count} /Root 1 0 R /Info 6 0 R /ID [<${id}> <${id}>] >>\nstartxref\n${xrefAt}\n%%EOF\n`;

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

/** Word-wrap prose to `maxChars` per line (callers that pick a width in
 *  characters; wrapToWidth measures the real font). */
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
