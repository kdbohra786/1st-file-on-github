import { NextResponse } from "next/server";
import { z } from "zod";
import { requireCtx } from "@/server/context";
import { handle } from "@/server/errors";
import { completeUpload } from "@/server/files";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const ctx = await requireCtx(req);
    const { parts } = z
      .object({ parts: z.array(z.object({ PartNumber: z.number().int().min(1), ETag: z.string().min(1) })).min(1) })
      .parse(await req.json());
    return NextResponse.json(
      await completeUpload(
        ctx,
        z
          .string()
          .uuid()
          .parse((await params).id),
        parts,
      ),
    );
  } catch (e) {
    return handle(e);
  }
}
