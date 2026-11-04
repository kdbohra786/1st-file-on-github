import { api } from "./api";

export interface UploadHandle {
  pause(): void;
  resume(): void;
  cancel(): void;
  done: Promise<void>;
}

const PARALLEL = 4;
const RETRIES = 4;

function putPart(url: string, blob: Blob, onBytes: (loaded: number) => void, signal: AbortSignal): Promise<string> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    xhr.upload.onprogress = (e) => onBytes(e.loaded);
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        const etag = xhr.getResponseHeader("ETag");
        if (etag) resolve(etag);
        else reject(new Error("Storage did not expose the ETag header (check CORS ExposeHeaders)"));
      } else reject(new Error(`Part upload failed (${xhr.status})`));
    };
    xhr.onerror = () => reject(new Error("Network error during upload"));
    signal.addEventListener("abort", () => {
      xhr.abort();
      reject(new DOMException("aborted", "AbortError"));
    });
    xhr.send(blob);
  });
}

/** Resumable multipart upload straight to object storage: parallel parts, retry with backoff, pause/resume, cancel. */
export function uploadFile(file: File, parentId: string, onProgress: (loaded: number) => void): UploadHandle {
  const ctl = new AbortController();
  let paused = false;
  let wake: (() => void) | null = null;
  const gate = async () => {
    while (paused && !ctl.signal.aborted) await new Promise<void>((r) => (wake = r));
  };

  const run = async () => {
    const init = await api<{ uploadSessionId: string; partSize: number; partCount: number }>("POST", "/uploads", {
      parentId,
      name: file.name,
      size: file.size,
      contentType: file.type || "application/octet-stream",
    });
    const { uploadSessionId: sid, partSize, partCount } = init;
    const done = new Map<number, string>();
    const inFlight = new Map<number, number>();
    const report = () => {
      let total = 0;
      for (const n of done.keys()) total += Math.min(partSize, file.size - (n - 1) * partSize);
      for (const v of inFlight.values()) total += v;
      onProgress(total);
    };
    let next = 1;
    const worker = async () => {
      while (next <= partCount && !ctl.signal.aborted) {
        await gate();
        const n = next++;
        const blob = file.slice((n - 1) * partSize, Math.min(file.size, n * partSize));
        for (let attempt = 0; ; attempt++) {
          try {
            await gate();
            const { url } = await api<{ url: string }>("POST", `/uploads/${sid}/sign-part`, { partNumber: n });
            const etag = await putPart(
              url,
              blob,
              (l) => {
                inFlight.set(n, l);
                report();
              },
              ctl.signal,
            );
            inFlight.delete(n);
            done.set(n, etag);
            report();
            break;
          } catch (e) {
            inFlight.delete(n);
            if (ctl.signal.aborted || attempt >= RETRIES) throw e;
            await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));
          }
        }
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(PARALLEL, partCount) }, worker));
      if (ctl.signal.aborted) throw new DOMException("aborted", "AbortError");
      const parts = [...done].sort((a, b) => a[0] - b[0]).map(([PartNumber, ETag]) => ({ PartNumber, ETag }));
      await api("POST", `/uploads/${sid}/complete`, { parts });
    } catch (e) {
      ctl.abort();
      await api("DELETE", `/uploads/${sid}`).catch(() => {});
      throw e;
    }
  };

  return {
    pause() {
      paused = true;
    },
    resume() {
      paused = false;
      wake?.();
    },
    cancel() {
      ctl.abort();
      paused = false;
      wake?.();
    },
    done: run(),
  };
}
