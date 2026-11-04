import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { ApiError, handle } from "@/server/errors";
import { initUpload } from "@/server/files";
import { rateLimit } from "@/lib/auth/rate-limit";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  try {
    const ctx = await requireCtx(req);
    if (!(await rateLimit(`presign:${ctx.actor.id}`, 300, 60)))
      throw new ApiError(429, "rate_limited", "Too many requests");
    const body = z
      .object({
        parentId: z.string().uuid(),
        name: z.string().trim().min(1).max(255),
        size: z
          .number()
          .int()
          .min(0)
          .max(5 * 1024 ** 4),
        contentType: z.string().max(255).default("application/octet-stream"),
      })
      .parse(await req.json());
    return NextResponse.json(await initUpload(ctx, body), { status: 201 });
  } catch (e) {
    return handle(e);
  }
}
