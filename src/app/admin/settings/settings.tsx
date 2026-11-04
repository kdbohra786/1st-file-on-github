"use client";
import { useState } from "react";
import { api } from "@/lib/client/api";
import { btnPrimary, ErrorBox, field, useLoad } from "@/components/ui";

type S = { signup_enabled: boolean; blocked_extensions: string[] };

export function Settings() {
  const { data, error, reload } = useLoad<S>("/admin/settings");
  const [msg, setMsg] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);
  if (!data)
    return (
      <main className="p-6">
        <ErrorBox error={error} />
        {!error && "Loading..."}
      </main>
    );
  return (
    <main className="mx-auto grid max-w-xl gap-3 p-4">
      <h1 className="text-xl font-bold">Platform settings</h1>
      <form
        key={JSON.stringify(data)}
        className="grid gap-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const f = new FormData(e.currentTarget);
          const exts = String(f.get("exts") ?? "")
            .split(/[\s,]+/)
            .filter(Boolean)
            .map((x) => (x.startsWith(".") ? x : `.${x}`).toLowerCase());
          setErr(null);
          try {
            await api("PUT", "/admin/settings", { signup_enabled: f.get("signup") === "on", blocked_extensions: exts });
            setMsg("Saved.");
            reload();
          } catch (x) {
            setErr(x instanceof Error ? x.message : String(x));
          }
        }}
      >
        <label className="flex items-center gap-2">
          <input type="checkbox" name="signup" defaultChecked={data.signup_enabled} />
          Allow public sign-up for individuals
        </label>
        <label className="grid gap-1 text-sm">
          Blocked file extensions (comma or space separated)
          <textarea className={field} name="exts" rows={3} defaultValue={data.blocked_extensions.join(" ")} />
        </label>
        <ErrorBox error={err} />
        {msg && (
          <p role="status" className="text-sm text-green-700">
            {msg}
          </p>
        )}
        <button className={btnPrimary}>Save settings</button>
      </form>
    </main>
  );
}
