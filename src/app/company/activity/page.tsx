import { AuditLog } from "@/components/audit-log";
import { CompanyPage } from "@/components/company-page";

export default function Page() {
  return (
    <CompanyPage>
      <AuditLog base="/company/activity" title="Activity log" />
    </CompanyPage>
  );
}
