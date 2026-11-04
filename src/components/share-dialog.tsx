"use client";
import { useCallback, useEffect, useState } from "react";
import { api, type NodeDto } from "@/lib/client/api";

type Link = {
  id: string;
  url: string;
  hasPassword: boolean;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  allowDownload: boolean;
  revokedAt: string | null;
  createdAt: string;
};
type Stats = {
  views: number;
  downloads: number;
  unique: number;
  countries: { country: string; count: number }[];
  timeline: { day: string; count: number }[];
};

const btn = "rounded border px-2 py-1 text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10";
const input = "rounded border px-2 py-1 text-sm";

export function ShareDialog({ node, onClose }: { node: NodeDto; onClose: () => void }) {
  const [links, setLinks] = useState<Link[]>([]);
  const [stats, setStats] = useState<Record<string, Stats>>({});
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<string | null>(null);
  const [form, setForm] = useState({ password: "", expiresAt: "", maxDownloads: "", allowDownload: true });

  const load = useCallback(async () => {
    try {
      setLinks((await api<{ items: Link[] }>("GET", `/shares?nodeId=${node.id}`)).items);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [node.id]);

  useEffect(() => {
    // Fetch on open; load() sets state by design.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const create = async () => {
    setError(null);
    try {
      const body: Record<string, unknown> = { nodeId: node.id, allowDownload: form.allowDownload };
      if (form.password) body.password = form.password;
      if (form.expiresAt) body.expiresAt = new Date(form.expiresAt).toISOString();
      if (form.maxDownloads) body.maxDownloads = Number(form.maxDownloads);
      const r = await api<{ link: Link }>("POST", "/shares", body);
      setCreated(r.link.url);
      setForm({ password: "", expiresAt: "", maxDownloads: "", allowDownload: true });
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  const showStats = async (id: string) => {
    try {
      setStats((s) => ({ ...s, [id]: undefined as never }));
      const r = await api<Stats>("GET", `/shares/${id}`);
      setStats((s) => ({ ...s, [id]: r }));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div
      className="fixed inset-0 z-20 flex items-center justify-center bg-black/60 p-4"
      role="dialog"
      aria-label={`Share ${node.name}`}
      onClick={onClose}
    >
      <div
        className="max-h-full w-full max-w-xl overflow-auto rounded bg-white p-4 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex justify-between">
          <strong className="truncate">Share &quot;{node.name}&quot;</strong>
          <button className={btn} onClick={onClose}>
            Close
          </button>
        </div>
        {error && (
          <p role="alert" className="mb-2 text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="mb-4 grid gap-2 rounded border p-3 text-sm">
          <label className="grid gap-1">
            Password (optional)
            <input
              className={input}
              type="password"
              autoComplete="new-password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
            />
          </label>
          <label className="grid gap-1">
            Expires (optional)
            <input
              className={input}
              type="datetime-local"
              value={form.expiresAt}
              onChange={(e) => setForm({ ...form, expiresAt: e.target.value })}
            />
          </label>
          {
            <label className="grid gap-1">
              Max downloads (optional)
              <input
                className={input}
                type="number"
                min={1}
                value={form.maxDownloads}
                onChange={(e) => setForm({ ...form, maxDownloads: e.target.value })}
              />
            </label>
          }
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={form.allowDownload}
              onChange={(e) => setForm({ ...form, allowDownload: e.target.checked })}
            />
            Allow download (untick for view-only)
          </label>
          <button className={`${btn} bg-cyan-600 text-white`} onClick={create}>
            Create link
          </button>
          {created && (
            <p className="break-all rounded bg-green-50 p-2 text-green-900" data-testid="created-link">
              {created}{" "}
              <button className="ml-2 underline" onClick={() => void navigator.clipboard?.writeText(created)}>
                Copy
              </button>
            </p>
          )}
        </div>

        <h3 className="mb-1 text-sm font-semibold">Links for this item</h3>
        {links.length === 0 && <p className="text-sm opacity-60">No links yet.</p>}
        <ul className="grid gap-2">
          {links.map((l) => (
            <li key={l.id} className="rounded border p-2 text-sm" data-testid="link-row">
              <div className="break-all">{l.url}</div>
              <div className="mt-1 flex flex-wrap gap-x-3 opacity-70">
                {l.revokedAt ? <strong className="text-red-600">Revoked</strong> : <span>Active</span>}
                {l.hasPassword && <span>Password</span>}
                {l.expiresAt && <span>Expires {new Date(l.expiresAt).toLocaleString()}</span>}
                {l.maxDownloads !== null && (
                  <span>
                    {l.downloadCount}/{l.maxDownloads} downloads
                  </span>
                )}
                {!l.allowDownload && <span>View only</span>}
              </div>
              <div className="mt-1 flex gap-1">
                <button className={btn} onClick={() => void navigator.clipboard?.writeText(l.url)}>
                  Copy
                </button>
                <button className={btn} onClick={() => showStats(l.id)}>
                  Stats
                </button>
                {!l.revokedAt && (
                  <button
                    className={btn}
                    onClick={async () => {
                      await api("DELETE", `/shares/${l.id}`).catch((e) => setError(String(e.message)));
                      await load();
                    }}
                  >
                    Revoke
                  </button>
                )}
              </div>
              {stats[l.id] && (
                <p className="mt-1 text-xs" data-testid="stats">
                  {stats[l.id].views} views · {stats[l.id].downloads} downloads · {stats[l.id].unique} unique visitors
                  {stats[l.id].countries.length > 0 &&
                    ` · ${stats[l.id].countries.map((c) => `${c.country} ${c.count}`).join(", ")}`}
                </p>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
