import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { handle } from "@/server/errors";
import { abortUpload } from "@/server/files";

export const dynamic = "force-dynamic";

export async function DELETE(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCtx(req);
    await abortUpload(
      ctx,
      z
        .string()
        .uuid()
        .parse((await params).id),
    );
    return new NextResponse(null, { status: 204 });
  } catch (e) {
    return handle(e);
  }
}
