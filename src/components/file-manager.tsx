/* eslint-disable @next/next/no-img-element -- previews use presigned S3 URLs, which must not be proxied through the app */
"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { api, ApiFail, formatBytes, type NodeDto } from "@/lib/client/api";
import { uploadFile, type UploadHandle } from "@/lib/client/uploader";

type Crumb = { id: string | null; name: string };
type Usage = { usedBytes: number; quotaBytes: number; percent: number };
type UploadItem = {
  key: number;
  name: string;
  size: number;
  loaded: number;
  state: "uploading" | "paused" | "done" | "error";
  error?: string;
  handle?: UploadHandle;
};

const btn = "rounded border px-2 py-1 text-sm hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10";

export function FileManager({ accent = "cyan" }: { accent?: "cyan" | "blue" }) {
  const [crumbs, setCrumbs] = useState<Crumb[]>([{ id: null, name: "My Files" }]);
  const [items, setItems] = useState<NodeDto[]>([]);
  const [can, setCan] = useState<string[]>([]);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [view, setView] = useState<"files" | "trash">("files");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [preview, setPreview] = useState<{ node: NodeDto; url: string; text?: string } | null>(null);
  const [dragging, setDragging] = useState(false);
  const keyRef = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const current = crumbs[crumbs.length - 1];
  const color = accent === "blue" ? "bg-blue-600" : "bg-cyan-600";

  const fail = (e: unknown) => setError(e instanceof Error ? e.message : String(e));

  const refreshUsage = useCallback(
    () =>
      api<Usage>("GET", "/usage")
        .then(setUsage)
        .catch(() => {}),
    [],
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      if (view === "trash") {
        setItems((await api<{ items: NodeDto[] }>("GET", "/trash")).items);
        setCan([]);
      } else {
        const r = await api<{ items: NodeDto[]; can: string[] }>(
          "GET",
          `/nodes${current.id ? `?parentId=${current.id}` : ""}`,
        );
        // A user with a single root (their home folder) lands inside it.
        if (!current.id && r.items.length === 1 && r.items[0].type === "folder" && !r.items[0].isSharedRoot) {
          setCrumbs([{ id: r.items[0].id, name: "My Files" }]);
          return;
        }
        setItems(r.items);
        setCan(r.can);
      }
    } catch (e) {
      fail(e);
    } finally {
      setLoading(false);
    }
  }, [current.id, view]);

  useEffect(() => {
    // Fetch-on-navigation: load() sets loading/items state by design.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);
  useEffect(() => {
    void refreshUsage();
  }, [refreshUsage]);

  const startUpload = (file: File) => {
    if (!current.id) return fail(new Error("Open a folder first"));
    const key = ++keyRef.current;
    const patch = (p: Partial<UploadItem>) => setUploads((u) => u.map((x) => (x.key === key ? { ...x, ...p } : x)));
    const handle = uploadFile(file, current.id, (loaded) => patch({ loaded }));
    setUploads((u) => [...u, { key, name: file.name, size: file.size, loaded: 0, state: "uploading", handle }]);
    handle.done
      .then(() => {
        patch({ state: "done", loaded: file.size });
        void load();
        void refreshUsage();
      })
      .catch((e: unknown) =>
        patch({
          state: "error",
          error: e instanceof DOMException ? "Cancelled" : e instanceof Error ? e.message : String(e),
        }),
      );
  };

  const act = async (fn: () => Promise<unknown>) => {
    try {
      await fn();
      await load();
      await refreshUsage();
    } catch (e) {
      fail(e);
    }
  };

  const open = async (n: NodeDto) => {
    if (n.type === "folder") return setCrumbs([...crumbs, { id: n.id, name: n.name }]);
    try {
      const { url } = await api<{ url: string }>("GET", `/nodes/${n.id}/download?inline=1`);
      const text =
        n.mime?.startsWith("text/") || n.mime === "application/json"
          ? await fetch(url)
              .then((r) => r.text())
              .then((t) => t.slice(0, 20000))
          : undefined;
      setPreview({ node: n, url, text });
    } catch (e) {
      fail(e);
    }
  };

  const download = async (n: NodeDto) => {
    try {
      const { url } = await api<{ url: string }>("GET", `/nodes/${n.id}/download`);
      const a = document.createElement("a");
      a.href = url;
      a.click();
    } catch (e) {
      fail(e);
    }
  };

  const canDo = (p: string) => view === "files" && can.includes(p);
  const pct = usage?.percent ?? 0;

  return (
    <div
      className="mx-auto max-w-5xl p-4"
      onDragOver={(e) => {
        if (canDo("upload")) {
          e.preventDefault();
          setDragging(true);
        }
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        if (canDo("upload")) [...e.dataTransfer.files].forEach(startUpload);
      }}
    >
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <nav aria-label="Breadcrumb" className="flex flex-1 flex-wrap items-center gap-1 text-sm">
          {view === "trash" ? (
            <strong>Trash</strong>
          ) : (
            crumbs.map((c, i) => (
              <span key={c.id ?? "root"} className="flex items-center gap-1">
                {i > 0 && <span className="opacity-40">/</span>}
                <button
                  className={i === crumbs.length - 1 ? "font-semibold" : "underline"}
                  onClick={() => setCrumbs(crumbs.slice(0, i + 1))}
                >
                  {c.name}
                </button>
              </span>
            ))
          )}
        </nav>
        <button className={btn} onClick={() => setView(view === "files" ? "trash" : "files")}>
          {view === "files" ? "Trash" : "Back to files"}
        </button>
        {canDo("manage_folders") && (
          <button
            className={btn}
            onClick={() => {
              const name = prompt("Folder name");
              if (name && current.id) void act(() => api("POST", "/nodes", { parentId: current.id, name }));
            }}
          >
            New folder
          </button>
        )}
        {canDo("upload") && (
          <>
            <button className={`${btn} ${color} text-white`} onClick={() => fileInput.current?.click()}>
              Upload
            </button>
            <input
              ref={fileInput}
              type="file"
              multiple
              hidden
              data-testid="file-input"
              onChange={(e) => {
                [...(e.target.files ?? [])].forEach(startUpload);
                e.target.value = "";
              }}
            />
          </>
        )}
      </div>

      {usage && (
        <div className="mb-4" aria-label="Storage usage">
          <div className="h-2 w-full overflow-hidden rounded bg-black/10 dark:bg-white/10">
            <div
              className={`h-full ${pct >= 100 ? "bg-red-600" : pct >= 90 ? "bg-orange-500" : pct >= 80 ? "bg-yellow-500" : color}`}
              style={{ width: `${Math.min(100, pct)}%` }}
            />
          </div>
          <p className="mt-1 text-xs opacity-70">
            {formatBytes(usage.usedBytes)} of {formatBytes(usage.quotaBytes)} used ({pct}%)
            {pct >= 80 && (
              <strong className="ml-2 text-orange-600">
                {pct >= 100 ? "Storage full: uploads are blocked." : "Running low on storage."}
              </strong>
            )}
          </p>
        </div>
      )}

      {error && (
        <p role="alert" className="mb-3 rounded border border-red-300 bg-red-50 p-2 text-sm text-red-700">
          {error}
        </p>
      )}
      {dragging && <p className="mb-3 rounded border-2 border-dashed p-6 text-center">Drop files to upload</p>}

      <ul className="divide-y rounded border">
        {loading && <li className="p-4 text-sm opacity-60">Loading...</li>}
        {!loading && items.length === 0 && (
          <li className="p-6 text-center text-sm opacity-60">
            {view === "trash" ? "Trash is empty." : "This folder is empty."}
          </li>
        )}
        {items.map((n) => (
          <li key={n.id} className="flex items-center gap-3 p-2 text-sm" data-testid="row">
            <span aria-hidden>{n.type === "folder" ? "📁" : "📄"}</span>
            <button className="flex-1 truncate text-left hover:underline" onClick={() => view === "files" && open(n)}>
              {n.name}
            </button>
            <span className="w-20 text-right opacity-60">{n.type === "file" ? formatBytes(n.sizeBytes) : ""}</span>
            <span className="flex gap-1">
              {view === "trash" ? (
                <button className={btn} onClick={() => act(() => api("PATCH", `/nodes/${n.id}`, { restore: true }))}>
                  Restore
                </button>
              ) : (
                <>
                  {n.type === "file" && (
                    <button className={btn} onClick={() => download(n)}>
                      Download
                    </button>
                  )}
                  {canDo("rename_move") && (
                    <button
                      className={btn}
                      onClick={() => {
                        const name = prompt("New name", n.name);
                        if (name && name !== n.name) void act(() => api("PATCH", `/nodes/${n.id}`, { name }));
                      }}
                    >
                      Rename
                    </button>
                  )}
                  {canDo("delete") && (
                    <button
                      className={btn}
                      onClick={() => {
                        if (confirm(`Move "${n.name}" to Trash?`)) void act(() => api("DELETE", `/nodes/${n.id}`));
                      }}
                    >
                      Delete
                    </button>
                  )}
                </>
              )}
            </span>
          </li>
        ))}
      </ul>

      {uploads.length > 0 && (
        <div
          className="fixed bottom-4 right-4 w-80 rounded border bg-white p-3 text-sm shadow-lg dark:bg-neutral-900"
          aria-label="Uploads"
        >
          <div className="mb-1 flex justify-between font-semibold">
            Uploads{" "}
            <button onClick={() => setUploads((u) => u.filter((x) => x.state === "uploading" || x.state === "paused"))}>
              Clear
            </button>
          </div>
          {uploads.map((u) => (
            <div key={u.key} className="mb-2" data-testid="upload">
              <div className="flex justify-between gap-2">
                <span className="truncate">{u.name}</span>
                <span>
                  {u.state === "done"
                    ? "Done"
                    : u.state === "error"
                      ? u.error
                      : `${Math.round((u.loaded / Math.max(1, u.size)) * 100)}%`}
                </span>
              </div>
              <div className="h-1 bg-black/10">
                <div
                  className={`h-1 ${u.state === "error" ? "bg-red-600" : color}`}
                  style={{ width: `${(u.loaded / Math.max(1, u.size)) * 100}%` }}
                />
              </div>
              {(u.state === "uploading" || u.state === "paused") && (
                <div className="mt-1 flex gap-1">
                  {u.state === "uploading" ? (
                    <button
                      className={btn}
                      onClick={() => {
                        u.handle?.pause();
                        setUploads((l) => l.map((x) => (x.key === u.key ? { ...x, state: "paused" } : x)));
                      }}
                    >
                      Pause
                    </button>
                  ) : (
                    <button
                      className={btn}
                      onClick={() => {
                        u.handle?.resume();
                        setUploads((l) => l.map((x) => (x.key === u.key ? { ...x, state: "uploading" } : x)));
                      }}
                    >
                      Resume
                    </button>
                  )}
                  <button className={btn} onClick={() => u.handle?.cancel()}>
                    Cancel
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {preview && (
        <div
          className="fixed inset-0 z-10 flex items-center justify-center bg-black/70 p-4"
          role="dialog"
          aria-label={`Preview ${preview.node.name}`}
          onClick={() => setPreview(null)}
        >
          <div
            className="max-h-full w-full max-w-4xl overflow-auto rounded bg-white p-4 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-2 flex justify-between">
              <strong>{preview.node.name}</strong>
              <button className={btn} onClick={() => setPreview(null)}>
                Close
              </button>
            </div>
            {preview.node.mime?.startsWith("image/") ? (
              <img src={preview.url} alt={preview.node.name} className="mx-auto max-h-[70vh]" />
            ) : preview.node.mime?.startsWith("video/") ? (
              <video src={preview.url} controls className="mx-auto max-h-[70vh]" />
            ) : preview.node.mime?.startsWith("audio/") ? (
              <audio src={preview.url} controls className="w-full" />
            ) : preview.node.mime === "application/pdf" ? (
              <iframe src={preview.url} title={preview.node.name} className="h-[70vh] w-full" sandbox="" />
            ) : preview.text !== undefined ? (
              <pre className="whitespace-pre-wrap text-xs">{preview.text}</pre>
            ) : (
              <p className="text-sm opacity-70">
                No preview for this file type.{" "}
                <button className="underline" onClick={() => download(preview.node)}>
                  Download it
                </button>
                .
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export { ApiFail };
