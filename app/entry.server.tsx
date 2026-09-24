import { isInk } from "./services/app-flavor.server";
import { flavorLogger } from "./services/ink-log.server";
const console = flavorLogger("render");
// The framework otherwise serializes arbitrary thrown errors into logs.
export const handleError = isInk() ? () => console.error("Request failed") : undefined;
import { PassThrough } from "stream";
import { renderToPipeableStream } from "react-dom/server";
import { ServerRouter } from "react-router";
import { createReadableStreamFromReadable } from "@react-router/node";
import { type EntryContext } from "react-router";
import { isbot } from "isbot";
import { addDocumentResponseHeaders } from "./shopify.server";

// Both apps stream each order's record — ink's Orders (routes/app.ink.$section.tsx),
// the Ritualist's Orders and Dashboard (services/ritualist-rows.server.ts) — and
// a record's whole read may take up to RECORD_READ_TIMEOUT_MS (15 s), so the
// stream waits 20 s before it gives up on a row. (The Ritualist kept 5 s while
// it streamed nothing; at 5 s its biggest records would draw as unread.)
export const streamTimeout = 20_000;

export default async function handleRequest(
  request: Request,
  responseStatusCode: number,
  responseHeaders: Headers,
  reactRouterContext: EntryContext
) {
  addDocumentResponseHeaders(request, responseHeaders);
  if (isInk()) {
    responseHeaders.set("Cache-Control", "private, no-store");
    responseHeaders.set("Referrer-Policy", "no-referrer");
    responseHeaders.set("X-Content-Type-Options", "nosniff");
  }
  const userAgent = request.headers.get("user-agent");
  const callbackName = isbot(userAgent ?? '')
    ? "onAllReady"
    : "onShellReady";

  return new Promise((resolve, reject) => {
    const { pipe, abort } = renderToPipeableStream(
      <ServerRouter
        context={reactRouterContext}
        url={request.url}
      />,
      {
        [callbackName]: () => {
          const body = new PassThrough();
          const stream = createReadableStreamFromReadable(body);

          responseHeaders.set("Content-Type", "text/html");
          resolve(
            new Response(stream, {
              headers: responseHeaders,
              status: responseStatusCode,
            })
          );
          pipe(body);
        },
        onShellError(error) {
          reject(error);
        },
        onError(error) {
          responseStatusCode = 500;
          console.error(error);
        },
      }
    );

    // Automatically timeout the React renderer after 6 seconds, which ensures
    // React has enough time to flush down the rejected boundary contents
    setTimeout(abort, streamTimeout + 1000);
  });
}
