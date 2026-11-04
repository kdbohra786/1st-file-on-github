import { ADMIN_NAV, PanelShell } from "@/components/panel-shell";
import { AuditLog } from "@/components/audit-log";

export default function Page() {
  return (
    <PanelShell title="Super Admin" accent="indigo" roles={["SUPER_ADMIN"]} nav={ADMIN_NAV}>
      <AuditLog base="/admin/audit" title="Audit log" showTenantFilter />
    </PanelShell>
  );
}
