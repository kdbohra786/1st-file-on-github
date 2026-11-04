import { ADMIN_NAV, PanelShell } from "@/components/panel-shell";
import { Plans } from "./plans";

export default function Page() {
  return (
    <PanelShell title="Super Admin" accent="indigo" roles={["SUPER_ADMIN"]} nav={ADMIN_NAV}>
      <Plans />
    </PanelShell>
  );
}
