import { Suspense } from "react";
import { ADMIN_NAV, PanelShell } from "@/components/panel-shell";
import { TenantList } from "./tenant-list";

export default function Page() {
  return (
    <PanelShell title="Super Admin" accent="indigo" roles={["SUPER_ADMIN"]} nav={ADMIN_NAV}>
      <Suspense>
        <TenantList />
      </Suspense>
    </PanelShell>
  );
}
