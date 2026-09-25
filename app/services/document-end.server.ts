// THE DOCUMENT CLOSES LAST — why a "$" sat under every ink page (2026-09-25).
//
// React 18 writes the shell's `</body></html>` as soon as the shell is ready.
// React Router's ServerRouter renders its data stream (StreamTransfer) inside
// a Suspense boundary AFTER the router, so that boundary's markers arrive
// after `</html>`:
//
//     …</body></html><!--$?--><template id="B:0"></template><!--/$-->…
//
// The HTML parser puts a comment that follows `</html>` on the Document, but
// the <template> into <body>. When the data arrives, React's inline `$RC`
// takes the template's previous sibling as the boundary's opening comment and
// sets its text to "$". The real comment is on the Document, so `$RC` writes
// "$" into whatever body node came last before the template.
//
// Behind Cloudflare (install.in.ink, ink's host), that node is a newline:
// Cloudflare's Web Analytics injects `<script … data-cf-beacon=…></script>\n`
// just before `</body>`. The newline became a visible "$" at the left edge
// under every ink page. The Ritualist's host (app.in.ink) is served straight
// from Cloud Run with no injection, so its last body node is a <script> and
// the stray write lands on an element, where it shows nothing.
//
// The fix holds the shell's `</body></html>` back and writes it at the very
// end of the stream. Every boundary marker and `$RC` script then lands inside
// <body>, `$RC` finds its own comment whatever a proxy inserts before
// `</body>`, and anything injected before `</body>` now sits after all of
// React's content. React 18 does not check <body>'s trailing nodes when it
// hydrates, so the moved markers change nothing for hydration.

import { Transform, type TransformCallback } from "stream";

const END = Buffer.from("</body></html>");

/**
 * A byte stream that removes the first `</body></html>` and writes it once,
 * after everything else. A document without it passes through unchanged.
 * Works on bytes, so a chunk boundary inside a multi-byte character or inside
 * the end tags themselves cannot break it.
 */
export function closeDocumentLast(): Transform {
  let carry = Buffer.alloc(0);
  let held = false;
  return new Transform({
    transform(chunk: Buffer | string, _encoding, callback: TransformCallback) {
      const bytes = typeof chunk === "string" ? Buffer.from(chunk) : chunk;
      if (held) return callback(null, bytes);
      const joined = carry.length ? Buffer.concat([carry, bytes]) : bytes;
      const at = joined.indexOf(END);
      if (at !== -1) {
        held = true;
        carry = Buffer.alloc(0);
        return callback(null, Buffer.concat([joined.subarray(0, at), joined.subarray(at + END.length)]));
      }
      // Keep back just enough bytes to catch the end tags split across chunks.
      const keep = Math.min(joined.length, END.length - 1);
      carry = Buffer.from(joined.subarray(joined.length - keep));
      callback(null, joined.subarray(0, joined.length - keep));
    },
    flush(callback: TransformCallback) {
      callback(null, held ? Buffer.concat([carry, END]) : carry);
    },
  });
}
