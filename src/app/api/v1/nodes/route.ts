import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { handle } from "@/server/errors";
import { createFolder, listChildren } from "@/server/files";

export const dynamic = "force-dynamic";

const uuid = z.string().uuid();

export async function GET(req: Request) {
  try {
    const ctx = await requireCtx(req);
    const p = new URL(req.url).searchParams.get("parentId");
    const items = await listChildren(ctx, p ? uuid.parse(p) : null);
    return NextResponse.json({ items });
  } catch (e) {
    return handle(e);
  }
}

export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(req);
    const body = z.object({ parentId: uuid, name: z.string().trim().min(1).max(255) }).parse(await req.json());
    return NextResponse.json({ node: await createFolder(ctx, body.parentId, body.name) }, { status: 201 });
  } catch (e) {
    return handle(e);
  }
}
