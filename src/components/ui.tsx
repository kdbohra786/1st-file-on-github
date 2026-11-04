"use client";
import { useCallback, useEffect, useState } from "react";
import { api, formatBytes } from "@/lib/client/api";

export const btn = "rounded border px-2 py-1 text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10";
export const btnPrimary =
  "rounded bg-indigo-700 px-3 py-1.5 text-sm font-medium text-white hover:opacity-90 disabled:opacity-50";
export const field = "rounded border px-2 py-1 text-sm bg-transparent";
export const th = "px-2 py-1 text-left text-xs font-semibold uppercase opacity-60";
export const td = "px-2 py-1.5 text-sm";

/** GET a JSON endpoint; `reload()` refetches. No synchronous state updates inside the effect. */
export function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (!path) return;
    let live = true;
    api<T>("GET", path).then(
      (d) => live && (setData(d), setError(null)),
      (e) => live && setError(e instanceof Error ? e.message : String(e)),
    );
    return () => {
      live = false;
    };
  }, [path, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, reload };
}

export function ErrorBox({ error }: { error: string | null }) {
  return error ? (
    <p role="alert" className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
      {error}
    </p>
  ) : null;
}

export function Card({ title, children }: { title?: string; children: React.ReactNode }) {
  return (
    <section className="rounded border p-4">
      {title && <h2 className="mb-2 text-sm font-semibold uppercase opacity-60">{title}</h2>}
      {children}
    </section>
  );
}

export function Stat({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="rounded border p-3" data-testid="stat">
      <div className="text-xs uppercase opacity-60">{label}</div>
      <div className="text-2xl font-bold">{value}</div>
      {sub && <div className="text-xs opacity-60">{sub}</div>}
    </div>
  );
}

export function Meter({ used, quota }: { used: number; quota: number }) {
  const pct = quota ? Math.min(100, (used / quota) * 100) : 0;
  return (
    <div title={`${pct.toFixed(1)}%`}>
      <div className="h-1.5 w-32 overflow-hidden rounded bg-black/10 dark:bg-white/10">
        <div
          className={`h-full ${pct >= 100 ? "bg-red-600" : pct >= 90 ? "bg-orange-500" : "bg-indigo-600"}`}
          style={{ width: `${pct}%` }}
        />
      </div>
      <div className="text-xs opacity-70">
        {formatBytes(used)} / {formatBytes(quota)}
      </div>
    </div>
  );
}

export const GB = 1024 ** 3;
export const toGb = (b: number) => Math.round((b / GB) * 100) / 100;
export const fmtDate = (d: string | null) => (d ? new Date(d).toLocaleString() : "-");
