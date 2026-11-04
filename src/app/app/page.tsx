import { FileManager } from "@/components/file-manager";
import { PanelShell } from "@/components/panel-shell";

export default function Page() {
  return (
    <PanelShell title="My Files" accent="cyan" roles={["COMPANY_ADMIN", "MEMBER", "INDIVIDUAL"]}>
      <FileManager accent="cyan" />
    </PanelShell>
  );
}
