/* eslint-disable @next/next/no-img-element -- previews use presigned S3 URLs, which must not be proxied through the app */
"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { formatBytes } from "@/lib/client/api";

type Item = { id: string; name: string; type: "file" | "folder"; sizeBytes: number; mime: string | null };
type Props = {
  token: string;
  name: string;
  isFolder: boolean;
  sizeLabel: string;
  mime: string | null;
  hasPassword: boolean;
  unlocked: boolean;
  allowDownload: boolean;
};

const btn = "rounded border px-3 py-1.5 text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10";

async function call(token: string, path: string, body?: unknown) {
  const res = await fetch(`/api/s/${token}/${path}`, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? undefined : { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(json?.error?.message ?? "Request failed");
  return json;
}

export function PublicShare(p: Props) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [preview, setPreview] = useState<{ url: string; mime: string | null; name: string } | null>(null);
  const [stack, setStack] = useState<{ id?: string; name: string }[]>([{ name: p.name }]);
  const [items, setItems] = useState<Item[] | null>(null);

  const guard = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const loadFolder = (id: string | undefined, nextStack: typeof stack) =>
    guard(async () => {
      const r = await call(p.token, `list${id ? `?folderId=${id}` : ""}`);
      setItems(r.items);
      setStack(nextStack);
    });

  const download = (id?: string) =>
    guard(async () => {
      const r = await call(p.token, "download", { nodeId: id });
      window.location.href = r.url;
    });
  const view = (id?: string) =>
    guard(async () => {
      const r = await call(p.token, "preview", { nodeId: id });
      setPreview(r);
    });

  if (p.hasPassword && !p.unlocked) {
    return (
      <form
        className="flex flex-col gap-3"
        onSubmit={(e) => {
          e.preventDefault();
          const pw = new FormData(e.currentTarget).get("password");
          void guard(async () => {
            await call(p.token, "unlock", { password: pw });
            router.refresh();
          });
        }}
      >
        <h1 className="text-xl font-bold">This link is password protected</h1>
        <input
          name="password"
          type="password"
          required
          autoComplete="off"
          placeholder="Password"
          className="rounded border px-3 py-2"
        />
        {error && (
          <p role="alert" className="text-sm text-red-600">
            {error}
          </p>
        )}
        <button disabled={busy} className={`${btn} bg-cyan-600 text-white`}>
          Unlock
        </button>
      </form>
    );
  }

  const previewable = (m: string | null) =>
    Boolean(
      m &&
      (m.startsWith("image/") ||
        m.startsWith("video/") ||
        m.startsWith("audio/") ||
        m === "application/pdf" ||
        m.startsWith("text/")),
    );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <h1 className="break-all text-2xl font-bold">
          {p.isFolder ? "📁 " : "📄 "}
          {p.name}
        </h1>
        {!p.isFolder && <p className="text-sm opacity-60">{p.sizeLabel}</p>}
        {!p.allowDownload && (
          <p className="mt-1 text-sm text-orange-600">View only: downloads are disabled for this link.</p>
        )}
      </div>
      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      {!p.isFolder && (
        <div className="flex gap-2">
          {p.allowDownload && (
            <button disabled={busy} className={`${btn} bg-cyan-600 text-white`} onClick={() => download()}>
              Download
            </button>
          )}
          {previewable(p.mime) && (
            <button disabled={busy} className={btn} onClick={() => view()}>
              Preview
            </button>
          )}
        </div>
      )}

      {p.isFolder && (
        <div>
          {items === null ? (
            <button disabled={busy} className={btn} onClick={() => loadFolder(undefined, [{ name: p.name }])}>
              Show contents
            </button>
          ) : (
            <>
              <nav className="mb-2 flex flex-wrap gap-1 text-sm">
                {stack.map((c, i) => (
                  <span key={c.id ?? "root"}>
                    {i > 0 && " / "}
                    <button className="underline" onClick={() => loadFolder(c.id, stack.slice(0, i + 1))}>
                      {c.name}
                    </button>
                  </span>
                ))}
              </nav>
              <ul className="divide-y rounded border" data-testid="public-list">
                {items.length === 0 && <li className="p-3 text-sm opacity-60">Empty folder.</li>}
                {items.map((n) => (
                  <li key={n.id} className="flex items-center gap-2 p-2 text-sm">
                    <span>{n.type === "folder" ? "📁" : "📄"}</span>
                    {n.type === "folder" ? (
                      <button
                        className="flex-1 truncate text-left hover:underline"
                        onClick={() => loadFolder(n.id, [...stack, { id: n.id, name: n.name }])}
                      >
                        {n.name}
                      </button>
                    ) : (
                      <span className="flex-1 truncate">{n.name}</span>
                    )}
                    {n.type === "file" && <span className="opacity-60">{formatBytes(n.sizeBytes)}</span>}
                    {n.type === "file" && previewable(n.mime) && (
                      <button className={btn} onClick={() => view(n.id)}>
                        Preview
                      </button>
                    )}
                    {n.type === "file" && p.allowDownload && (
                      <button className={btn} onClick={() => download(n.id)}>
                        Download
                      </button>
                    )}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      )}

      {preview && (
        <div className="rounded border p-3" role="region" aria-label="Preview">
          <div className="mb-2 flex justify-between text-sm">
            <strong className="truncate">{preview.name}</strong>
            <button className="underline" onClick={() => setPreview(null)}>
              Close
            </button>
          </div>
          {preview.mime?.startsWith("image/") ? (
            <img src={preview.url} alt={preview.name} className="mx-auto max-h-[60vh]" />
          ) : preview.mime?.startsWith("video/") ? (
            <video src={preview.url} controls className="mx-auto max-h-[60vh]" />
          ) : preview.mime?.startsWith("audio/") ? (
            <audio src={preview.url} controls className="w-full" />
          ) : (
            <iframe src={preview.url} title={preview.name} className="h-[60vh] w-full" sandbox="" />
          )}
        </div>
      )}
    </div>
  );
}
