// THE STUDIO, ONE PRESS FROM EVERY PAGE — The Ritualist's wordmark at the top
// right of each page (Sam, 2026-09-24: "i want the ability to open the
// Ritualist studio in all pages - make the link persistant in the top right
// The Ritualist logo"). The wordmark is the landing's: lowercase, with its
// period, set in capitals by letter-spacing.
//
// The press is the Dashboard's own door (routes/app.dashboard.tsx action):
// it mints the merchant's sign-in and opens The Ritualist Studio, signed in,
// in a new tab. The tab opens inside the click, so no browser blocks it as a
// popup, and is pointed at the signed-in address when it comes back.

import { useEffect, useRef } from "react";
import { useFetcher } from "react-router";

type Door = { url: string | null; error: string | null };

export default function StudioLink() {
  const fetcher = useFetcher<Door>();
  const pending = useRef<Window | null>(null);
  const opening = fetcher.state !== "idle";

  useEffect(() => {
    const data = fetcher.data;
    if (!data) return;
    if (data.url) {
      if (pending.current) pending.current.location.href = data.url;
      else window.open(data.url, "_blank", "noopener,noreferrer");
    } else if (pending.current) {
      pending.current.close();
    }
    pending.current = null;
  }, [fetcher.data]);

  const open = () => {
    pending.current = window.open("", "_blank");
    fetcher.submit({}, { method: "post", action: "/app/dashboard" });
  };

  return (
    <span style={{ display: "inline-flex", flexDirection: "column", alignItems: "flex-end", gap: "2px" }}>
      <button
        type="button"
        onClick={open}
        disabled={opening}
        aria-label="Open The Ritualist Studio"
        title="Open The Ritualist Studio"
        data-studio-link
        style={{
          background: "none",
          border: 0,
          padding: "6px 0",
          cursor: opening ? "progress" : "pointer",
          color: "#0e1116",
          fontSize: "13px",
          fontWeight: 600,
          letterSpacing: "0.18em",
          textTransform: "uppercase",
          whiteSpace: "nowrap",
          opacity: opening ? 0.5 : 1,
        }}
      >
        the ritualist. <span aria-hidden>↗</span>
      </button>
      {fetcher.data?.error && (
        <span role="alert" style={{ fontSize: "12px", color: "#6d7175" }}>
          {fetcher.data.error}
        </span>
      )}
    </span>
  );
}
