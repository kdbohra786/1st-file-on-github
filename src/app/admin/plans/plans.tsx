"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { btn, btnPrimary, ErrorBox, field, GB, td, th, toGb, useLoad } from "@/components/ui";

type P = {
  id: string;
  name: string;
  quotaBytes: number;
  maxUsers: number;
  maxFileBytes: number;
  priceLabel: string | null;
  isActive: boolean;
};

export function Plans() {
  const { data, error, reload } = useLoad<{ items: P[] }>("/admin/plans");
  const [err, setErr] = useState<string | null>(null);
  const [editing, setEditing] = useState<string | null>(null);

  const submit = async (e: React.FormEvent<HTMLFormElement>, id: string | null) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const body = {
      name: f.get("name"),
      quotaBytes: Math.round(Number(f.get("quotaGb")) * GB),
      maxUsers: Number(f.get("maxUsers")),
      maxFileBytes: Math.round(Number(f.get("maxFileGb")) * GB),
      priceLabel: f.get("price") || null,
      isActive: f.get("active") === "on",
    };
    setErr(null);
    try {
      await (id ? api("PUT", `/admin/plans/${id}`, body) : api("POST", "/admin/plans", body));
      setEditing(null);
      reload();
    } catch (x) {
      setErr(x instanceof Error ? x.message : String(x));
    }
  };

  const form = (p?: P) => (
    <form
      onSubmit={(e) => submit(e, p?.id ?? null)}
      className="flex flex-wrap items-center gap-2"
      aria-label={p ? `Edit ${p.name}` : "New plan"}
    >
      <input className={field} name="name" required defaultValue={p?.name} placeholder="Name" />
      <input
        className={`${field} w-24`}
        name="quotaGb"
        type="number"
        step="0.01"
        min={0}
        required
        defaultValue={p ? toGb(p.quotaBytes) : ""}
        placeholder="Quota GB"
      />
      <input
        className={`${field} w-20`}
        name="maxUsers"
        type="number"
        min={1}
        required
        defaultValue={p?.maxUsers ?? 1}
        placeholder="Users"
      />
      <input
        className={`${field} w-24`}
        name="maxFileGb"
        type="number"
        step="0.01"
        min={0.01}
        required
        defaultValue={p ? toGb(p.maxFileBytes) : 5}
        placeholder="Max file GB"
      />
      <input className={field} name="price" defaultValue={p?.priceLabel ?? ""} placeholder="Price label" />
      <label className="flex items-center gap-1 text-sm">
        <input type="checkbox" name="active" defaultChecked={p?.isActive ?? true} />
        Active
      </label>
      <button className={btnPrimary}>{p ? "Save" : "Add plan"}</button>
    </form>
  );

  return (
    <main className="mx-auto grid max-w-5xl gap-4 p-4">
      <h1 className="text-xl font-bold">Plans</h1>
      <ErrorBox error={err ?? error} />
      <table className="w-full" data-testid="plans">
        <thead>
          <tr>
            <th className={th}>Name</th>
            <th className={th}>Quota</th>
            <th className={th}>Users</th>
            <th className={th}>Max file</th>
            <th className={th}>Price</th>
            <th className={th}>Active</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.items.map((p) => (
            <tr key={p.id} className="border-t">
              {editing === p.id ? (
                <td colSpan={7} className={td}>
                  {form(p)}
                </td>
              ) : (
                <>
                  <td className={td}>{p.name}</td>
                  <td className={td}>{toGb(p.quotaBytes)} GB</td>
                  <td className={td}>{p.maxUsers}</td>
                  <td className={td}>{toGb(p.maxFileBytes)} GB</td>
                  <td className={td}>{p.priceLabel}</td>
                  <td className={td}>{p.isActive ? "Yes" : "No"}</td>
                  <td className={td}>
                    <button className={btn} onClick={() => setEditing(p.id)}>
                      Edit
                    </button>
                  </td>
                </>
              )}
            </tr>
          ))}
        </tbody>
      </table>
      <div className="rounded border p-4">
        <h2 className="mb-2 font-semibold">Add a plan</h2>
        {form()}
      </div>
    </main>
  );
}
