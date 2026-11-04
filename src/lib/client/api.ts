export interface NodeDto {
  id: string;
  name: string;
  type: "file" | "folder";
  sizeBytes: number;
  mime: string | null;
  status: string;
  parentId: string | null;
  isSharedRoot: boolean;
  updatedAt: string;
}

export class ApiFail extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

export async function api<T = unknown>(method: string, path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/v1${path}`, {
    method,
    headers: body ? { "content-type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (res.status === 204) return undefined as T;
  const json = await res.json().catch(() => null);
  if (!res.ok)
    throw new ApiFail(
      res.status,
      json?.error?.code ?? "error",
      json?.error?.message ?? `Request failed (${res.status})`,
    );
  return json as T;
}

export function formatBytes(n: number) {
  if (n < 1024) return `${n} B`;
  const u = ["KB", "MB", "GB", "TB"];
  let i = -1;
  do {
    n /= 1024;
    i++;
  } while (n >= 1024 && i < u.length - 1);
  return `${n.toFixed(n >= 100 ? 0 : 1)} ${u[i]}`;
}
