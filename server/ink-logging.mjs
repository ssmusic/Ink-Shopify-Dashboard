import { createRequire } from "node:module";

// react-router-serve's default access logger includes the full request URL,
// including session tokens on embedded launches. Override only its URL token
// in the ink process; the Ritualist keeps the stock logger.
export function configureInkAccessLogging(ink, logger) {
  if (ink) logger.token("url", () => "[redacted]");
}

export function protectInkAccessLogs(ink) {
  if (!ink) return;
  const requireServe = createRequire(
    import.meta.resolve("@react-router/serve"),
  );
  configureInkAccessLogging(true, requireServe("morgan"));
}
