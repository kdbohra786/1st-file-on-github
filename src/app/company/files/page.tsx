import { CompanyPage } from "@/components/company-page";
import { FileManager } from "@/components/file-manager";

export default function Page() {
  return (
    <CompanyPage>
      <FileManager accent="blue" />
    </CompanyPage>
  );
}
