// The public verify page's address — one author, so the card, the PDF and
// the QR never drift (the brand-page-url law, applied to the verify door).
const VERIFY_BASE = (process.env.INK_VERIFY_BASE_URL || "https://www.in.ink/verify").replace(/\/+$/, "");

export function publicVerifyUrl(proofId: string): string {
  return `${VERIFY_BASE}/${encodeURIComponent(proofId)}`;
}

export function verifyQrSrc(proofId: string): string {
  // ink's own QR door (image/svg+xml), never a third party — the proof id is
  // the capability. The door accepts https://{*.}in.ink URLs only.
  const api = (process.env.INK_API_URL || process.env.NFS_API_URL || "https://us-central1-inink-c76d3.cloudfunctions.net/api").replace(/\/+$/, "");
  return `${api}/qr?u=${encodeURIComponent(publicVerifyUrl(proofId))}`;
}
