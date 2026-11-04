import type { Metadata } from "next";
import { cookies, headers } from "next/headers";
import { formatBytes } from "@/lib/client/api";
import { isUnlocked, recordVisit, resolveLink, unlockCookieName } from "@/server/shares";
import { PublicShare } from "./public-share";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Shared file | Infinitive Cloud Bucket",
  robots: { index: false, follow: false },
};

const MESSAGES: Record<string, string> = {
  revoked: "This link has been revoked by its owner.",
  expired: "This link has expired.",
  limit_reached: "This link has reached its download limit.",
  unavailable: "This content is no longer available.",
};

export default async function SharePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const r = token.length >= 20 && token.length <= 100 ? await resolveLink(token) : null;
  if (!r || r.state !== "ok") {
    return (
      <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-2 p-6 text-center">
        <h1 className="text-xl font-bold">Link unavailable</h1>
        <p className="opacity-70">{r ? MESSAGES[r.state] : "This link does not exist."}</p>
      </main>
    );
  }
  const h = await headers();
  const c = await cookies();
  const unlocked = isUnlocked(r.link, c.get(unlockCookieName(r.link.id))?.value);
  await recordVisit(r.link, "view", {
    ip: h.get("cf-connecting-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? null,
    userAgent: h.get("user-agent"),
    referrer: h.get("referer"),
    country: h.get("cf-ipcountry"),
  });
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-4 p-6">
      <p className="text-sm font-semibold text-cyan-600">Infinitive Cloud Bucket</p>
      <PublicShare
        token={token}
        name={r.node.name}
        isFolder={r.node.type === "folder"}
        sizeLabel={r.node.type === "file" ? formatBytes(r.node.sizeBytes) : ""}
        mime={r.node.mime}
        hasPassword={Boolean(r.link.passwordHash)}
        unlocked={unlocked}
        allowDownload={r.link.allowDownload}
      />
    </main>
  );
}
