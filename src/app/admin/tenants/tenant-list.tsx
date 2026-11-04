"use client";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { btnPrimary, ErrorBox, field, fmtDate, Meter, td, th, useLoad } from "@/components/ui";

type T = {
  id: string;
  type: string;
  name: string;
  status: string;
  plan: string | null;
  used: number;
  quota: number;
  planExpiresAt: string | null;
  members: number;
  maxUsers: number;
};
type Plan = { id: string; name: string };

export function TenantList() {
  const type = useSearchParams().get("type") ?? "company";
  const [q, setQ] = useState("");
  const [status, setStatus] = useState("");
  const qs = new URLSearchParams({ type, ...(q ? { q } : {}), ...(status ? { status } : {}) }).toString();
  const { data, error, reload } = useLoad<{ items: T[] }>(`/admin/tenants?${qs}`);
  const plans = useLoad<{ items: Plan[] }>("/admin/plans");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const create = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setErr(null);
    try {
      const r = await api<{ tempPassword?: string; adminEmail: string; emailed: boolean }>("POST", "/admin/tenants", {
        type,
        name: f.get("name"),
        planName: f.get("plan"),
        adminEmail: f.get("email"),
        adminName: f.get("adminName"),
      });
      setMsg(
        r.emailed
          ? `Account created. Login details were emailed to ${r.adminEmail}.`
          : `Account created. Temporary password for ${r.adminEmail}: ${r.tempPassword} (shown once).`,
      );
      reload();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    }
  };

  return (
    <main className="mx-auto grid max-w-6xl gap-4 p-4">
      <h1 className="text-xl font-bold">{type === "company" ? "Companies" : "Individuals"}</h1>
      <div className="flex flex-wrap gap-2">
        <input
          className={field}
          placeholder="Search name"
          aria-label="Search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
        <select className={field} aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="suspended">Suspended</option>
          <option value="read_only">Read-only</option>
        </select>
      </div>
      <ErrorBox error={error} />
      <table className="w-full" data-testid="tenants">
        <thead>
          <tr>
            <th className={th}>Name</th>
            <th className={th}>Plan</th>
            <th className={th}>Status</th>
            <th className={th}>Usage</th>
            <th className={th}>Users</th>
            <th className={th}>Plan expiry</th>
          </tr>
        </thead>
        <tbody>
          {data?.items.map((t) => (
            <tr key={t.id} className="border-t">
              <td className={td}>
                <Link className="underline" href={`/admin/tenants/${t.id}`}>
                  {t.name}
                </Link>
              </td>
              <td className={td}>{t.plan}</td>
              <td className={td}>{t.status}</td>
              <td className={td}>
                <Meter used={t.used} quota={t.quota} />
              </td>
              <td className={td}>
                {t.members}
                {type === "company" ? ` / ${t.maxUsers}` : ""}
              </td>
              <td className={td}>{fmtDate(t.planExpiresAt)}</td>
            </tr>
          ))}
          {data && data.items.length === 0 && (
            <tr>
              <td className={td} colSpan={6}>
                Nothing found.
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <form onSubmit={create} className="grid max-w-md gap-2 rounded border p-4" aria-label="Create account">
        <h2 className="font-semibold">Create {type === "company" ? "company" : "individual"} account</h2>
        <input
          className={field}
          name="name"
          required
          placeholder={type === "company" ? "Company name" : "Account name"}
        />
        <input
          className={field}
          name="adminName"
          required
          placeholder={type === "company" ? "Admin full name" : "Person's full name"}
        />
        <input className={field} name="email" type="email" required placeholder="Login email" />
        <select className={field} name="plan" required defaultValue={type === "company" ? "Starter" : "Free"}>
          {plans.data?.items.map((p) => (
            <option key={p.id}>{p.name}</option>
          ))}
        </select>
        <ErrorBox error={err} />
        {msg && (
          <p role="status" className="rounded bg-green-50 p-2 text-sm text-green-900" data-testid="create-result">
            {msg}
          </p>
        )}
        <button className={btnPrimary}>Create account</button>
      </form>
    </main>
  );
}
