import { createRequire } from "node:module";

// react-router-serve's default access logger includes the full request URL,
// including session tokens on embedded launches. Override only its URL token
// in the ink process; the Ritualist keeps the stock logger.
export function configureInkAccessLogging(ink, logger) {
  if (ink) logger.token("url", () => "[redacted]");
}

export function protectInkAccessLogs(ink) {
  if (!ink) return;
  // Resolve morgan the way react-router-serve does: from its own directory.
  // The package exports only "./package.json" — resolving the bare name threw
  // "No exports main defined" at start-up and ink-app 00025 never listened.
  const requireHere = createRequire(import.meta.url);
  const requireServe = createRequire(
    requireHere.resolve("@react-router/serve/package.json"),
  );
  configureInkAccessLogging(true, requireServe("morgan"));
}
