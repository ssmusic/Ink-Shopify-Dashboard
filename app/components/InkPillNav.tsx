import { Tabs } from "@shopify/polaris";
export type InkSection = "orders" | "insights" | "settings";
const tabs = [
  { id: "orders", content: "Orders", url: "/app/ink" },
  { id: "insights", content: "Dashboard", url: "/app/ink?view=insights" },
  { id: "settings", content: "Settings", url: "/app/ink/settings" },
];
export default function InkPillNav({ active }: { active: InkSection }) {
  return <Tabs tabs={tabs} selected={tabs.findIndex((t) => t.id === active)} />;
}
