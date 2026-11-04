"use client";
import { useState } from "react";
import { PermissionPicker } from "@/components/permission-picker";
import { btn, btnPrimary, Card, ErrorBox, field, useLoad } from "@/components/ui";
import { api } from "@/lib/client/api";
import { TEMPLATES, type Permission } from "@/lib/permissions";

type F = {
  id: string;
  name: string;
  access: { id: string; userId: string; name: string; email: string; permissions: Permission[] }[];
};
type M = { id: string; name: string; email: string };

export function Shared() {
  const { data, error, reload } = useLoad<{ items: F[] }>("/company/shared");
  const members = useLoad<{ items: M[] }>("/company/members");
  const [err, setErr] = useState<string | null>(null);
  const [perms, setPerms] = useState<Record<string, Permission[]>>({});
  const run = async (fn: () => Promise<unknown>) => {
    setErr(null);
    try {
      await fn();
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  return (
    <main className="mx-auto grid max-w-4xl gap-4 p-4">
      <h1 className="text-xl font-bold">Shared folders</h1>
      <p className="text-sm opacity-70">
        Company-wide folders (HR, Accounts...). Choose who can open each one and what they can do. You can fill them
        from the Files page.
      </p>
      <ErrorBox error={err ?? error} />
      <div className="grid gap-3" data-testid="shared-list">
        {data?.items.map((f) => {
          const sel = perms[f.id] ?? [...TEMPLATES.Viewer];
          return (
            <Card key={f.id} title={`📁 ${f.name}`}>
              <ul className="mb-3 text-sm">
                {f.access.length === 0 && <li className="opacity-60">No members have access yet.</li>}
                {f.access.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 py-0.5">
                    <span className="flex-1">
                      {a.name} ({a.email}): {a.permissions.join(", ")}
                    </span>
                    <button
                      className={btn}
                      onClick={() =>
                        run(() => api("PUT", `/company/shared/${f.id}/access`, { userId: a.userId, permissions: [] }))
                      }
                    >
                      Remove
                    </button>
                  </li>
                ))}
              </ul>
              <form
                className="grid gap-2"
                aria-label={`Grant access to ${f.name}`}
                onSubmit={(e) => {
                  e.preventDefault();
                  const uid = new FormData(e.currentTarget).get("user");
                  void run(() => api("PUT", `/company/shared/${f.id}/access`, { userId: uid, permissions: sel }));
                }}
              >
                <select name="user" required className={field}>
                  {members.data?.items.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.name} ({m.email})
                    </option>
                  ))}
                </select>
                <PermissionPicker value={sel} onChange={(v) => setPerms({ ...perms, [f.id]: v })} />
                <button className={btnPrimary}>Grant / update access</button>
              </form>
            </Card>
          );
        })}
        {data && data.items.length === 0 && <p className="text-sm opacity-60">No shared folders yet.</p>}
      </div>
      <form
        className="flex max-w-md gap-2 rounded border p-4"
        aria-label="New shared folder"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const name = new FormData(form).get("name");
          void run(async () => {
            await api("POST", "/company/shared", { name });
            form.reset();
          });
        }}
      >
        <input className={`${field} flex-1`} name="name" required placeholder="Folder name, e.g. HR" />
        <button className={btnPrimary}>Create shared folder</button>
      </form>
    </main>
  );
}
