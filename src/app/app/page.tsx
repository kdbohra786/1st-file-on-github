import { FileManager } from "@/components/file-manager";
import { PanelShell } from "@/components/panel-shell";

export default function Page() {
  return (
    <PanelShell title="My Files" accent="cyan">
      <FileManager accent="cyan" />
    </PanelShell>
  );
}
