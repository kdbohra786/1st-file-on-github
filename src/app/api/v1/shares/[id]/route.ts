import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { handle } from "@/server/errors";
import { linkAnalytics, revokeLink } from "@/server/shares";

export const dynamic = "force-dynamic";
type P = { params: Promise<{ id: string }> };

export async function GET(req: Request, { params }: P) {
  try {
    return NextResponse.json(
      await linkAnalytics(
        await requireCtx(req),
        z
          .string()
          .uuid()
          .parse((await params).id),
      ),
    );
  } catch (e) {
    return handle(e);
  }
}

export async function DELETE(req: Request, { params }: P) {
  try {
    await revokeLink(
      await requireCtx(req),
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
