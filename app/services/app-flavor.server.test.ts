// ONE ENV VAR DECIDES WHICH APP THIS IS — and only its exact word.
//
// The Ritualist is live. A typo in APP_FLAVOR on its service, a stray value,
// a capitalised "Ink" — none of them may unmount it. Only `ink` is ink.

import { afterEach, describe, expect, it, vi } from "vitest";
import { appFlavor, isInk } from "./app-flavor.server";

afterEach(() => vi.unstubAllEnvs());

describe("appFlavor", () => {
  it("is the Ritualist when APP_FLAVOR is unset — every service that exists today", () => {
    vi.stubEnv("APP_FLAVOR", "");
    expect(appFlavor()).toBe("ritualist");
    expect(isInk()).toBe(false);
  });

  it("is ink for exactly the word `ink`", () => {
    vi.stubEnv("APP_FLAVOR", "ink");
    expect(appFlavor()).toBe("ink");
    expect(isInk()).toBe(true);
  });

  it.each(["Ink", "INK", " ink", "ink ", "ritualist", "the-ritualist", "true", "1"])(
    "reads %j as the Ritualist — a wrong word never quietly unmounts the live app",
    (value) => {
      vi.stubEnv("APP_FLAVOR", value);
      expect(appFlavor()).toBe("ritualist");
    },
  );

  it("is read at call time, so a service's env is what counts, not the moment the module loaded", () => {
    vi.stubEnv("APP_FLAVOR", "");
    expect(appFlavor()).toBe("ritualist");
    vi.stubEnv("APP_FLAVOR", "ink");
    expect(appFlavor()).toBe("ink");
  });
});
