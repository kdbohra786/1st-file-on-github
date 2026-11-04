"use client";
import { useState } from "react";
import { ErrorBox, field, fmtDate, td, th, useLoad } from "./ui";

type Row = {
  id: string;
  at: string;
  action: string;
  actorEmail: string | null;
  tenantName: string | null;
  targetType: string | null;
  metadata: Record<string, unknown>;
};

export function AuditLog({
  base,
  title,
  showTenantFilter,
}: {
  base: string;
  title: string;
  showTenantFilter?: boolean;
}) {
  const [f, setF] = useState({ actor: "", action: "", from: "", to: "" });
  const qs = new URLSearchParams(
    Object.entries({
      ...f,
      from: f.from ? new Date(f.from).toISOString() : "",
      to: f.to ? new Date(`${f.to}T23:59:59`).toISOString() : "",
    }).filter(([, v]) => v),
  ).toString();
  const { data, error } = useLoad<{ items: Row[] }>(`${base}?${qs}`);
  return (
    <main className="mx-auto grid max-w-6xl gap-3 p-4">
      <h1 className="text-xl font-bold">{title}</h1>
      <div className="flex flex-wrap gap-2">
        <input
          className={field}
          aria-label="Actor"
          placeholder="Actor email"
          value={f.actor}
          onChange={(e) => setF({ ...f, actor: e.target.value })}
        />
        <input
          className={field}
          aria-label="Action"
          placeholder="Action (e.g. file.)"
          value={f.action}
          onChange={(e) => setF({ ...f, action: e.target.value })}
        />
        <input
          className={field}
          aria-label="From"
          type="date"
          value={f.from}
          onChange={(e) => setF({ ...f, from: e.target.value })}
        />
        <input
          className={field}
          aria-label="To"
          type="date"
          value={f.to}
          onChange={(e) => setF({ ...f, to: e.target.value })}
        />
        <a className="rounded border px-2 py-1 text-sm" href={`${`/api/v1${base}`}?${qs}${qs ? "&" : ""}format=csv`}>
          Export CSV
        </a>
      </div>
      <ErrorBox error={error} />
      <table className="w-full" data-testid="audit">
        <thead>
          <tr>
            <th className={th}>Time</th>
            <th className={th}>Action</th>
            <th className={th}>Actor</th>
            {showTenantFilter && <th className={th}>Account</th>}
            <th className={th}>Details</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((r) => (
            <tr key={r.id} className="border-t align-top">
              <td className={td}>{fmtDate(r.at)}</td>
              <td className={td}>{r.action}</td>
              <td className={td}>{r.actorEmail ?? "-"}</td>
              {showTenantFilter && <td className={td}>{r.tenantName ?? "-"}</td>}
              <td className={`${td} break-all text-xs opacity-70`}>
                {Object.keys(r.metadata ?? {}).length ? JSON.stringify(r.metadata) : ""}
              </td>
            </tr>
          ))}
          {data && data.items.length === 0 && (
            <tr>
              <td className={td} colSpan={5}>
                No entries.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
