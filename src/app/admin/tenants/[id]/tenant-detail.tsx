"use client";
import { useState } from "react";
import { api, formatBytes, type NodeDto } from "@/lib/client/api";
import { btn, btnPrimary, Card, ErrorBox, field, fmtDate, GB, Meter, td, th, toGb, useLoad } from "@/components/ui";

type Detail = {
  tenant: {
    id: string;
    type: string;
    name: string;
    status: string;
    usedBytes: number;
    quotaBytes: number;
    planExpiresAt: string | null;
    maxUsers: number;
    bucketName: string;
  };
  plan: { name: string } | null;
  members: { id: string; email: string; name: string; role: string; status: string; lastLoginAt: string | null }[];
  payments: {
    id: string;
    amount: number;
    currency: string;
    paidOn: string;
    reference: string | null;
    note: string | null;
  }[];
};

export function TenantDetail({ id }: { id: string }) {
  const { data, error, reload } = useLoad<Detail>(`/admin/tenants/${id}`);
  const plans = useLoad<{ items: { id: string; name: string }[] }>("/admin/plans");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [granted, setGranted] = useState(false);
  const [stack, setStack] = useState<{ id: string | null; name: string }[]>([{ id: null, name: "Root" }]);
  const [items, setItems] = useState<NodeDto[]>([]);

  const run = async (fn: () => Promise<unknown>, ok: string) => {
    setErr(null);
    setMsg(null);
    try {
      await fn();
      setMsg(ok);
      reload();
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const browse = async (parentId: string | null, nextStack = stack) => {
    try {
      const r = await api<{ items: NodeDto[] }>(
        "GET",
        `/admin/tenants/${id}/nodes${parentId ? `?parentId=${parentId}` : ""}`,
      );
      setItems(r.items);
      setStack(nextStack);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  const openBucket = async () => {
    const reason = prompt("Why are you opening this bucket? (recorded in the audit log)");
    if (!reason) return;
    setErr(null);
    try {
      await api("POST", `/admin/tenants/${id}/access`, { reason });
      setGranted(true);
      await browse(null, [{ id: null, name: "Root" }]);
    } catch (e) {
      setErr(e instanceof Error ? e.message : String(e));
    }
  };

  if (!data)
    return (
      <main className="p-6">
        <ErrorBox error={error} />
        {!error && "Loading..."}
      </main>
    );
  const t = data.tenant;

  const save = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body: Record<string, unknown> = {
      name: f.get("name"),
      status: f.get("status"),
      quotaBytes: Math.round(Number(f.get("quotaGb")) * GB),
      maxUsers: Number(f.get("maxUsers")),
      planExpiresAt: f.get("expires") ? new Date(String(f.get("expires"))).toISOString() : null,
    };
    if (f.get("plan") && f.get("plan") !== data.plan?.name) {
      body.planName = f.get("plan");
      body.applyPlan = f.get("applyPlan") === "on";
    }
    void run(() => api("PATCH", `/admin/tenants/${id}`, body), "Saved.");
  };

  const pay = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = e.currentTarget;
    const d = new FormData(f);
    void run(async () => {
      await api("POST", `/admin/tenants/${id}/payments`, {
        amount: Math.round(Number(d.get("amount")) * 100),
        currency: "INR",
        paidOn: new Date(String(d.get("paidOn"))).toISOString(),
        reference: d.get("reference") || undefined,
        note: d.get("note") || undefined,
      });
      f.reset();
    }, "Payment recorded.");
  };

  return (
    <main className="mx-auto grid max-w-5xl gap-4 p-4">
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-bold">{t.name}</h1>
        <span className="rounded border px-2 text-xs">{t.type}</span>
        <span className="rounded border px-2 text-xs" data-testid="status">
          {t.status}
        </span>
        <Meter used={t.usedBytes} quota={t.quotaBytes} />
      </div>
      <ErrorBox error={err ?? error} />
      {msg && (
        <p role="status" className="rounded bg-green-50 p-2 text-sm text-green-900">
          {msg}
        </p>
      )}

      <Card title="Plan, quota and status">
        <form
          onSubmit={save}
          className="grid gap-2 md:grid-cols-2"
          aria-label="Edit account"
          key={`${t.quotaBytes}-${t.status}-${t.maxUsers}`}
        >
          <label className="grid gap-1 text-sm">
            Name
            <input className={field} name="name" defaultValue={t.name} required />
          </label>
          <label className="grid gap-1 text-sm">
            Status
            <select className={field} name="status" defaultValue={t.status === "deleted" ? "active" : t.status}>
              <option value="active">Active</option>
              <option value="read_only">Read-only</option>
              <option value="suspended">Suspended (login blocked)</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm">
            Quota (GB)
            <input
              className={field}
              name="quotaGb"
              type="number"
              step="0.01"
              min={0}
              defaultValue={toGb(t.quotaBytes)}
              required
            />
          </label>
          <label className="grid gap-1 text-sm">
            Max users
            <input className={field} name="maxUsers" type="number" min={1} defaultValue={t.maxUsers} required />
          </label>
          <label className="grid gap-1 text-sm">
            Plan
            <select className={field} name="plan" defaultValue={data.plan?.name}>
              {plans.data?.items.map((p) => (
                <option key={p.id}>{p.name}</option>
              ))}
            </select>
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="applyPlan" />
            Apply the new plan&apos;s quota and user limit
          </label>
          <label className="grid gap-1 text-sm">
            Plan expires
            <input className={field} name="expires" type="date" defaultValue={t.planExpiresAt?.slice(0, 10) ?? ""} />
          </label>
          <div className="flex items-end">
            <button className={btnPrimary}>Save changes</button>
          </div>
        </form>
        <div className="mt-3 flex gap-2">
          {t.status !== "active" && (
            <button
              className={btn}
              onClick={() => run(() => api("PATCH", `/admin/tenants/${id}`, { status: "active" }), "Reactivated.")}
            >
              Reactivate
            </button>
          )}
          <button
            className={btn}
            onClick={() => {
              if (confirm(`Delete ${t.name}? The account stops working immediately; data is purged later.`))
                void run(() => api("DELETE", `/admin/tenants/${id}`), "Account deleted.");
            }}
          >
            Delete account
          </button>
        </div>
      </Card>

      <Card title="Users">
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Name</th>
              <th className={th}>Email</th>
              <th className={th}>Role</th>
              <th className={th}>Status</th>
              <th className={th}>Last login</th>
            </tr>
          </thead>
          <tbody>
            {data.members.map((m) => (
              <tr key={m.id} className="border-t">
                <td className={td}>{m.name}</td>
                <td className={td}>{m.email}</td>
                <td className={td}>{m.role}</td>
                <td className={td}>{m.status}</td>
                <td className={td}>{fmtDate(m.lastLoginAt)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card title="Payments (manual record)">
        <table className="mb-3 w-full">
          <thead>
            <tr>
              <th className={th}>Date</th>
              <th className={th}>Amount</th>
              <th className={th}>Reference</th>
              <th className={th}>Note</th>
            </tr>
          </thead>
          <tbody>
            {data.payments.map((p) => (
              <tr key={p.id} className="border-t">
                <td className={td}>{new Date(p.paidOn).toLocaleDateString()}</td>
                <td className={td}>
                  {(p.amount / 100).toFixed(2)} {p.currency}
                </td>
                <td className={td}>{p.reference}</td>
                <td className={td}>{p.note}</td>
              </tr>
            ))}
            {data.payments.length === 0 && (
              <tr>
                <td className={td} colSpan={4}>
                  No payments recorded.
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <form onSubmit={pay} className="flex flex-wrap gap-2" aria-label="Record payment">
          <input
            className={field}
            name="amount"
            type="number"
            step="0.01"
            min={0}
            required
            placeholder="Amount (INR)"
          />
          <input className={field} name="paidOn" type="date" required />
          <input className={field} name="reference" placeholder="Reference" />
          <input className={field} name="note" placeholder="Note" />
          <button className={btn}>Record payment</button>
        </form>
      </Card>

      <Card title="Open bucket">
        {!granted ? (
          <div>
            <p className="mb-2 text-sm opacity-70">
              Browsing a customer&apos;s files requires a reason, which is written to the audit log.
            </p>
            <button className={btnPrimary} onClick={openBucket}>
              Open bucket
            </button>
          </div>
        ) : (
          <div data-testid="bucket-browser">
            <nav className="mb-2 flex gap-1 text-sm">
              {stack.map((c, i) => (
                <span key={c.id ?? "root"}>
                  {i > 0 && " / "}
                  <button className="underline" onClick={() => browse(c.id, stack.slice(0, i + 1))}>
                    {c.name}
                  </button>
                </span>
              ))}
            </nav>
            <ul className="divide-y rounded border">
              {items.length === 0 && <li className="p-2 text-sm opacity-60">Empty.</li>}
              {items.map((n) => (
                <li key={n.id} className="flex items-center gap-2 p-2 text-sm">
                  <span>{n.type === "folder" ? "📁" : "📄"}</span>
                  {n.type === "folder" ? (
                    <button
                      className="flex-1 text-left hover:underline"
                      onClick={() => browse(n.id, [...stack, { id: n.id, name: n.name }])}
                    >
                      {n.name}
                    </button>
                  ) : (
                    <span className="flex-1">{n.name}</span>
                  )}
                  {n.type === "file" && (
                    <>
                      <span className="opacity-60">{formatBytes(n.sizeBytes)}</span>
                      <button
                        className={btn}
                        onClick={async () => {
                          try {
                            const r = await api<{ url: string }>("GET", `/admin/tenants/${id}/nodes/${n.id}/download`);
                            window.location.href = r.url;
                          } catch (e) {
                            setErr(e instanceof Error ? e.message : String(e));
                          }
                        }}
                      >
                        Download
                      </button>
                    </>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </main>
  );
}
