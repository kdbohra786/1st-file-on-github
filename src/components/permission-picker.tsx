"use client";
import { PERMISSIONS, TEMPLATES, type Permission } from "@/lib/permissions";

const LABELS: Record<Permission, string> = {
  view: "View",
  upload: "Upload",
  download: "Download",
  rename_move: "Rename / move",
  delete: "Delete",
  share: "Share",
  manage_folders: "Manage folders",
};

export function PermissionPicker({ value, onChange }: { value: Permission[]; onChange: (v: Permission[]) => void }) {
  return (
    <div className="grid gap-2">
      <div className="flex flex-wrap gap-1 text-xs">
        {Object.keys(TEMPLATES).map((t) => (
          <button
            type="button"
            key={t}
            className="rounded border px-2 py-0.5 hover:bg-black/5"
            onClick={() => onChange([...TEMPLATES[t]])}
          >
            {t}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-3 text-sm">
        {PERMISSIONS.map((p) => (
          <label key={p} className="flex items-center gap-1">
            <input
              type="checkbox"
              checked={value.includes(p)}
              onChange={(e) => onChange(e.target.checked ? [...value, p] : value.filter((x) => x !== p))}
            />
            {LABELS[p]}
          </label>
        ))}
      </div>
    </div>
  );
}
