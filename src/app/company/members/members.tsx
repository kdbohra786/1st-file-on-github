"use client";
import { useState } from "react";
import { PermissionPicker } from "@/components/permission-picker";
import { btn, btnPrimary, ErrorBox, field, fmtDate, GB, td, th, toGb, useLoad } from "@/components/ui";
import { api, formatBytes } from "@/lib/client/api";
import { TEMPLATES, type Permission } from "@/lib/permissions";

type M = {
  id: string;
  name: string;
  email: string;
  status: string;
  lastLoginAt: string | null;
  capBytes: number | null;
  template: string | null;
  flags: Permission[] | null;
  scope: string | null;
  usedBytes: number;
};

export function Members() {
  const { data, error, reload } = useLoad<{ items: M[] }>("/company/members");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<M | null>(null);
  const [flags, setFlags] = useState<Permission[]>([]);

  const run = async (fn: () => Promise<unknown>, ok?: (r: never) => string) => {
    setErr(null);
    setMsg(null);
    try {
      const r = await fn();
      if (ok) setMsg(ok(r as never));
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };
  const credMsg = (who: string) => (r: { emailed: boolean; tempPassword?: string }) =>
    r.emailed ? `Login details emailed to ${who}.` : `Temporary password for ${who}: ${r.tempPassword} (shown once).`;

  return (
    <main className="mx-auto grid max-w-6xl gap-4 p-4">
      <h1 className="text-xl font-bold">Members</h1>
      <ErrorBox error={err ?? error} />
      {msg && (
        <p role="status" className="rounded bg-green-50 p-2 text-sm text-green-900" data-testid="member-msg">
          {msg}
        </p>
      )}
      <table className="w-full" data-testid="members">
        <thead>
          <tr>
            <th className={th}>Name</th>
            <th className={th}>Email</th>
            <th className={th}>Role / template</th>
            <th className={th}>Status</th>
            <th className={th}>Usage</th>
            <th className={th}>Last login</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.items.map((m) => (
            <tr key={m.id} className="border-t align-top" data-testid="member-row">
              <td className={td}>{m.name}</td>
              <td className={td}>{m.email}</td>
              <td className={td}>
                {m.template ?? "-"}
                {m.scope === "shared" ? " (shared folders only)" : ""}
              </td>
              <td className={td}>{m.status}</td>
              <td className={td}>
                {formatBytes(m.usedBytes)}
                {m.capBytes !== null ? ` / ${formatBytes(m.capBytes)}` : ""}
              </td>
              <td className={td}>{fmtDate(m.lastLoginAt)}</td>
              <td className={`${td} flex flex-wrap gap-1`}>
                <button
                  className={btn}
                  onClick={() => {
                    setEditing(m);
                    setFlags(m.flags ?? []);
                  }}
                >
                  Permissions
                </button>
                <button
                  className={btn}
                  onClick={() =>
                    run(() =>
                      api("PATCH", `/company/members/${m.id}`, {
                        status: m.status === "active" ? "suspended" : "active",
                      }),
                    )
                  }
                >
                  {m.status === "active" ? "Disable" : "Enable"}
                </button>
                <button
                  className={btn}
                  onClick={() => run(() => api("POST", `/company/members/${m.id}/reset-password`), credMsg(m.email))}
                >
                  Reset password
                </button>
                <button
                  className={btn}
                  onClick={() => {
                    if (confirm(`Delete ${m.name}? Their files stay in the company bucket.`))
                      void run(() => api("DELETE", `/company/members/${m.id}`));
                  }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {data && data.items.length === 0 && (
            <tr>
              <td className={td} colSpan={7}>
                No members yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      {editing && (
        <form
          className="grid gap-3 rounded border p-4"
          aria-label={`Permissions for ${editing.name}`}
          onSubmit={(e) => {
            e.preventDefault();
            const f = new FormData(e.currentTarget);
            const cap = String(f.get("cap") ?? "");
            void run(
              async () => {
                await api("PATCH", `/company/members/${editing.id}`, {
                  flags,
                  scope: f.get("scope"),
                  capBytes: cap === "" ? null : Math.round(Number(cap) * GB),
                });
                setEditing(null);
              },
              () => "Permissions saved.",
            );
          }}
        >
          <h2 className="font-semibold">Permissions for {editing.name}</h2>
          <PermissionPicker value={flags} onChange={setFlags} />
          <label className="grid gap-1 text-sm">
            Scope
            <select name="scope" className={field} defaultValue={editing.scope ?? "own"}>
              <option value="own">Own folder + granted shared folders</option>
              <option value="shared">Granted shared folders only</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Personal storage cap in GB (blank = no cap)
            <input
              name="cap"
              type="number"
              step="any"
              min={0}
              className={field}
              defaultValue={editing.capBytes === null ? "" : toGb(editing.capBytes)}
            />
          </label>
          <div className="flex gap-2">
            <button className={btnPrimary}>Save</button>
            <button type="button" className={btn} onClick={() => setEditing(null)}>
              Cancel
            </button>
          </div>
        </form>
      )}

      <form
        className="grid max-w-md gap-2 rounded border p-4"
        aria-label="Add member"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const f = new FormData(form);
          void run(
            async () => {
              const r = await api<{ emailed: boolean; tempPassword?: string }>("POST", "/company/members", {
                name: f.get("name"),
                email: f.get("email"),
                template: f.get("template"),
              });
              form.reset();
              return r;
            },
            credMsg(String(f.get("email"))),
          );
        }}
      >
        <h2 className="font-semibold">Add a member</h2>
        <input className={field} name="name" required placeholder="Full name" />
        <input className={field} name="email" type="email" required placeholder="Email" />
        <select className={field} name="template" defaultValue="Contributor">
          {Object.keys(TEMPLATES).map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <button className={btnPrimary}>Create member</button>
      </form>
    </main>
  );
}
