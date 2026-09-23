// INK'S PILL NAV — Dashboard · Orders · Records · Settings · Help, at the top of
// every ink screen, drawn as Polaris's own Tabs (pills).
//
// Sam, 2026-09-23: "yeah we need a pill nav in the app" · "which prob should
// be called a dashboard" · "dashboard should be first in the nav" · "why can
// you get the record in the order and in records? records seems unfinished" ·
// "dont we need a help section?".
//
// Labels are PLACEHOLDER copy — Sam's words replace them.
import { Tabs } from "@shopify/polaris";
export type InkSection = "orders" | "insights" | "records" | "settings" | "help";
const tabs = [
  { id: "insights", content: "Dashboard", url: "/app/ink?view=insights" },
  { id: "orders", content: "Orders", url: "/app/ink" },
  { id: "records", content: "Records", url: "/app/ink?view=records" },
  { id: "settings", content: "Settings", url: "/app/ink/settings" },
  { id: "help", content: "Help", url: "/app/ink?view=help" },
];
export default function InkPillNav({ active }: { active: InkSection }) {
  return <Tabs tabs={tabs} selected={tabs.findIndex((t) => t.id === active)} />;
}
