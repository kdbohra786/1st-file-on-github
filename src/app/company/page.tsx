import { FileManager } from "@/components/file-manager";
import { PanelShell } from "@/components/panel-shell";

export default function Page() {
  return (
    <PanelShell title="Company" accent="blue" roles={["COMPANY_ADMIN"]}>
      <FileManager accent="blue" />
    </PanelShell>
  );
}
