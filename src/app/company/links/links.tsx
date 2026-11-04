"use client";
import { useState } from "react";
import { btn, ErrorBox, fmtDate, td, th, useLoad } from "@/components/ui";
import { api } from "@/lib/client/api";

type L = {
  id: string;
  url: string;
  nodeName: string;
  creator: string;
  hasPassword: boolean;
  expiresAt: string | null;
  maxDownloads: number | null;
  downloadCount: number;
  allowDownload: boolean;
  revokedAt: string | null;
  createdAt: string;
};

export function Links() {
  const { data, error, reload } = useLoad<{ items: L[] }>("/shares");
  const [err, setErr] = useState<string | null>(null);
  return (
    <main className="mx-auto grid max-w-6xl gap-3 p-4">
      <h1 className="text-xl font-bold">Share links in your company</h1>
      <ErrorBox error={err ?? error} />
      <table className="w-full" data-testid="links">
        <thead>
          <tr>
            <th className={th}>Item</th>
            <th className={th}>Created by</th>
            <th className={th}>Created</th>
            <th className={th}>Settings</th>
            <th className={th}>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {data?.items.map((l) => (
            <tr key={l.id} className="border-t" data-testid="link-row">
              <td className={td}>{l.nodeName}</td>
              <td className={td}>{l.creator}</td>
              <td className={td}>{fmtDate(l.createdAt)}</td>
              <td className={`${td} text-xs`}>
                {[
                  l.hasPassword && "password",
                  l.expiresAt && `expires ${fmtDate(l.expiresAt)}`,
                  l.maxDownloads !== null && `${l.downloadCount}/${l.maxDownloads} downloads`,
                  !l.allowDownload && "view only",
                ]
                  .filter(Boolean)
                  .join(" · ") || "open link"}
              </td>
              <td className={td}>{l.revokedAt ? "Revoked" : "Active"}</td>
              <td className={td}>
                {!l.revokedAt && (
                  <button
                    className={btn}
                    onClick={async () => {
                      try {
                        await api("DELETE", `/shares/${l.id}`);
                        reload();
                      } catch (e) {
                        setErr(e instanceof Error ? e.message : String(e));
                      }
                    }}
                  >
                    Revoke
                  </button>
                )}
              </td>
            </tr>
          ))}
          {data && data.items.length === 0 && (
            <tr>
              <td className={td} colSpan={6}>
                No share links yet.
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </main>
  );
}
