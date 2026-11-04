import { FileManager } from "@/components/file-manager";
import { PanelShell } from "@/components/panel-shell";

export default function Page() {
  return (
    <PanelShell title="Company" accent="blue">
      <FileManager accent="blue" />
    </PanelShell>
  );
}
