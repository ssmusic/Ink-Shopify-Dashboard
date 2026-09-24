import { ReactNode } from "react";

// THE RITUALIST'S FRAME — ink's page width, and nothing above the page.
//
// Sam, 2026-09-24, with ink's Orders and Dashboard beside it: "make the site
// identical to this width and nav look on top bar and left side representing
// all pages". The width is ink's (routes/app.ink.$section.tsx INK_PAGE_WIDTH:
// wider than a Polaris page's 998 px, narrower than the admin's frame), with
// every page `fullWidth` inside it. The nav is the pill bar each page draws
// under its title (RitualistPillNav) and the admin's own left nav
// (routes/app.tsx NavMenu); the thin tab bar that sat above every page is gone.
export const PAGE_WIDTH = { maxWidth: 1400, margin: "0 auto" } as const;

const PolarisAppLayout = ({ children }: { children: ReactNode }) => <div style={PAGE_WIDTH}>{children}</div>;

export default PolarisAppLayout;
