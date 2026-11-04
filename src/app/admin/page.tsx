import { ADMIN_NAV, PanelShell } from "@/components/panel-shell";
import { Dashboard } from "./dashboard";

export default function Page() {
  return (
    <PanelShell title="Super Admin" accent="indigo" roles={["SUPER_ADMIN"]} nav={ADMIN_NAV}>
      <Dashboard />
    </PanelShell>
  );
}
