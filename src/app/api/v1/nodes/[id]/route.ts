import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { handle } from "@/server/errors";
import { moveNode, renameNode, restoreNode, trashNode } from "@/server/files";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };
const uuid = z.string().uuid();

export async function PATCH(req: Request, { params }: P) {
  try {
    const ctx = await requireCtx(req);
    const id = uuid.parse((await params).id);
    const body = z
      .object({
        name: z.string().trim().min(1).max(255).optional(),
        parentId: uuid.optional(),
        restore: z.literal(true).optional(),
      })
      .refine((b) => Object.keys(b).length === 1, "Send exactly one of name, parentId, restore")
      .parse(await req.json());
    if (body.restore) return NextResponse.json({ node: await restoreNode(ctx, id) });
    if (body.name) return NextResponse.json({ node: await renameNode(ctx, id, body.name) });
    return NextResponse.json({ node: await moveNode(ctx, id, body.parentId!) });
  } catch (e) {
    return handle(e);
  }
}

export async function DELETE(req: Request, { params }: P) {
  try {
    const ctx = await requireCtx(req);
    await trashNode(ctx, uuid.parse((await params).id));
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return handle(e);
  }
}
