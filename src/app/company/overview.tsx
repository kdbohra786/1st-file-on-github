"use client";
import { formatBytes } from "@/lib/client/api";
import { Card, ErrorBox, fmtDate, Meter, Stat, td, th, useLoad } from "@/components/ui";

type O = {
  name: string;
  status: string;
  usedBytes: number;
  quotaBytes: number;
  users: number;
  maxUsers: number;
  files: number;
  planExpiresAt: string | null;
  planExpiresInDays: number | null;
  recent: { id: string; at: string; action: string; actorEmail: string | null }[];
};

export function Overview() {
  const { data, error } = useLoad<O>("/company/overview");
  if (!data)
    return (
      <main className="p-6">
        <ErrorBox error={error} />
        {!error && "Loading..."}
      </main>
    );
  const d = data.planExpiresInDays;
  return (
    <main className="mx-auto grid max-w-5xl gap-4 p-4">
      <h1 className="text-xl font-bold">{data.name}</h1>
      {d !== null && d <= 30 && (
        <p
          role="alert"
          className="rounded border border-orange-300 bg-orange-50 p-2 text-sm text-orange-900"
          data-testid="expiry-warning"
        >
          {d < 0
            ? "Your plan has expired. The account is read-only."
            : `Your plan expires in ${d} day${d === 1 ? "" : "s"} (${fmtDate(data.planExpiresAt)}).`}{" "}
          Contact Infinitive Cloud to renew.
        </p>
      )}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Storage used" value={formatBytes(data.usedBytes)} sub={`of ${formatBytes(data.quotaBytes)}`} />
        <Stat label="Users" value={`${data.users} / ${data.maxUsers}`} />
        <Stat label="Files" value={data.files} />
        <Stat label="Status" value={data.status} />
      </div>
      <Meter used={data.usedBytes} quota={data.quotaBytes} />
      <Card title="Recent activity">
        <table className="w-full">
          <thead>
            <tr>
              <th className={th}>Time</th>
              <th className={th}>Action</th>
              <th className={th}>Who</th>
            </tr>
          </thead>
          <tbody>
            {data.recent.map((r) => (
              <tr key={r.id} className="border-t">
                <td className={td}>{fmtDate(r.at)}</td>
                <td className={td}>{r.action}</td>
                <td className={td}>{r.actorEmail ?? "-"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </main>
  );
}
