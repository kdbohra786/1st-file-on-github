"use client";
import Link from "next/link";
import { formatBytes } from "@/lib/client/api";
import { Card, ErrorBox, Meter, Stat, td, th, useLoad } from "@/components/ui";

type D = {
  companies: number;
  individuals: number;
  members: number;
  usedBytes: number;
  allocatedBytes: number;
  files: number;
  uploadsToday: number;
  downloadsToday: number;
  signups: { day: string; n: number }[];
  top: { id: string; name: string; type: string; used: number; quota: number }[];
  health: { db: boolean; s3: boolean };
};

export function Dashboard() {
  const { data, error } = useLoad<D>("/admin/dashboard");
  if (!data)
    return (
      <main className="p-6">
        <ErrorBox error={error} />
        {!error && "Loading..."}
      </main>
    );
  const max = Math.max(1, ...data.signups.map((s) => s.n));
  return (
    <main className="mx-auto grid max-w-6xl gap-4 p-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Companies" value={data.companies} />
        <Stat label="Individuals" value={data.individuals} />
        <Stat label="Members" value={data.members} />
        <Stat label="Files" value={data.files} />
        <Stat
          label="Storage used"
          value={formatBytes(data.usedBytes)}
          sub={`of ${formatBytes(data.allocatedBytes)} allocated`}
        />
        <Stat label="Uploads today" value={data.uploadsToday} />
        <Stat label="Downloads today" value={data.downloadsToday} />
        <Stat
          label="System health"
          value={data.health.db && data.health.s3 ? "OK" : "Degraded"}
          sub={`DB ${data.health.db ? "up" : "down"} · Storage ${data.health.s3 ? "up" : "down"}`}
        />
      </div>
      <Card title="New accounts, last 14 days">
        {data.signups.length === 0 ? (
          <p className="text-sm opacity-60">No signups yet.</p>
        ) : (
          <div className="flex h-24 items-end gap-1" role="img" aria-label="Signups per day">
            {data.signups.map((s) => (
              <div
                key={s.day}
                title={`${s.day}: ${s.n}`}
                className="w-6 bg-indigo-600"
                style={{ height: `${(s.n / max) * 100}%` }}
              />
            ))}
          </div>
        )}
      </Card>
      <Card title="Top accounts by usage">
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Account</th>
              <th className={th}>Type</th>
              <th className={th}>Usage</th>
            </tr>
          </thead>
          <tbody>
            {data.top.map((t) => (
              <tr key={t.id} className="border-t">
                <td className={td}>
                  <Link className="underline" href={`/admin/tenants/${t.id}`}>
                    {t.name}
                  </Link>
                </td>
                <td className={td}>{t.type}</td>
                <td className={td}>
                  <Meter used={t.used} quota={t.quota} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
