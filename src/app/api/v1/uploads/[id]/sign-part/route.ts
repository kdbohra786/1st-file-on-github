import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { ApiError, handle } from "@/server/errors";
import { signPart } from "@/server/files";
import { rateLimit } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCtx(req);
    if (!(await rateLimit(`presign:${ctx.actor.id}`, 3000, 60)))
      throw new ApiError(429, "rate_limited", "Too many requests");
    const { partNumber } = z.object({ partNumber: z.number().int().min(1).max(10000) }).parse(await req.json());
    return NextResponse.json(
      await signPart(
        ctx,
        z
          .string()
          .uuid()
          .parse((await params).id),
        partNumber,
      ),
    );
  } catch (e) {
    return handle(e);
  }
}
