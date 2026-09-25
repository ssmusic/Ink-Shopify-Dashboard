// A STYLE THE SERVER WRITES MUST SURVIVE THE SERVER (corvara, 2026-09-25):
// React escapes ">", "&" and quotes inside a <style> during SSR, so the CSS
// breaks and the page fails to hydrate — the Ritualist's Orders rows then
// waited forever for their streamed activity. The pill bar's style is pinned
// to render byte-identical on the server.
import { renderToString } from "react-dom/server";
import { createRoutesStub } from "react-router";
import { AppProvider } from "@shopify/polaris";
import translations from "@shopify/polaris/locales/en.json";
import { describe, expect, it } from "vitest";
import RitualistPillNav from "../components/RitualistPillNav";

describe("the Ritualist's pill bar style", () => {
  it("renders on the server with no escaped characters", () => {
    const Stub = createRoutesStub([{ path: "/", Component: () => <AppProvider i18n={translations}><RitualistPillNav /></AppProvider> }]);
    const style = renderToString(<Stub initialEntries={["/"]} />).match(/<style>([\s\S]*?)<\/style>/)?.[1] ?? "";
    expect(style).toContain(".rt-pillbar{display:grid");
    expect(style).not.toMatch(/&(gt|lt|amp|quot|#x27);/);
  });
});
