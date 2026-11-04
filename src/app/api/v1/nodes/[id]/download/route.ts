import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { handle } from "@/server/errors";
import { signDownload } from "@/server/files";
import { rateLimit } from "@/lib/auth/rate-limit";
import { ApiError } from "@/server/errors";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCtx(req);
    if (!(await rateLimit(`presign:${ctx.actor.id}`, 300, 60)))
      throw new ApiError(429, "rate_limited", "Too many requests");
    const inline = new URL(req.url).searchParams.get("inline") === "1";
    return NextResponse.json(
      await signDownload(
        ctx,
        z
          .string()
          .uuid()
          .parse((await params).id),
        { inline },
      ),
    );
  } catch (e) {
    return handle(e);
  }
}
