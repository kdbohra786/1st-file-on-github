import { COMPANY_NAV, PanelShell } from "./panel-shell";

export function CompanyPage({ children }: { children: React.ReactNode }) {
  return (
    <PanelShell title="Company" accent="blue" roles={["COMPANY_ADMIN"]} nav={COMPANY_NAV}>
      {children}
    </PanelShell>
  );
}
