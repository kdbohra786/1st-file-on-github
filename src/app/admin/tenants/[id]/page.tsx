import { ADMIN_NAV, PanelShell } from "@/components/panel-shell";
import { TenantDetail } from "./tenant-detail";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <PanelShell title="Super Admin" accent="indigo" roles={["SUPER_ADMIN"]} nav={ADMIN_NAV}>
      <TenantDetail id={id} />
    </PanelShell>
  );
}
