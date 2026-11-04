import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { handle } from "@/server/errors";
import { createLink, listLinks } from "@/server/shares";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(req);
    const nodeId = new URL(req.url).searchParams.get("nodeId");
    return NextResponse.json({ items: await listLinks(ctx, nodeId ? z.string().uuid().parse(nodeId) : undefined) });
  } catch (e) {
    return handle(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(req);
    const b = z
      .object({
        nodeId: z.string().uuid(),
        password: z.string().min(4).max(128).optional(),
        expiresAt: z.string().datetime().nullable().optional(),
        maxDownloads: z.number().int().min(1).max(1_000_000).nullable().optional(),
        allowDownload: z.boolean().default(true),
      })
      .parse(await req.json());
    const link = await createLink(ctx, b.nodeId, {
      password: b.password,
      expiresAt: b.expiresAt ? new Date(b.expiresAt) : null,
      maxDownloads: b.maxDownloads ?? null,
      allowDownload: b.allowDownload,
    });
    return NextResponse.json({ link }, { status: 201 });
  } catch (e) {
    return handle(e);
  }
}
