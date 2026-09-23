import { isInk } from "./app-flavor.server";

/** Ink diagnostics never serialize request data, URLs, credentials or errors.
 * The paid flavor retains its original logger and arguments. */
export function flavorLogger(component: string) {
  return Object.fromEntries(
    (["log", "warn", "error"] as const).map((level) => [
      level,
      (...args: unknown[]) => {
        if (isInk()) globalThis.console[level](`[ink:${component}] ${level}`);
        else globalThis.console[level](...args);
      },
    ]),
  ) as Pick<Console, "log" | "warn" | "error">;
}
