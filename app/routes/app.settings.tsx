import { json } from "@remix-run/node";
import Settings from "../components/settings/Settings";

export async function loader() {
  return json({});
}

export default function SettingsPage() {
  return <Settings />;
}
