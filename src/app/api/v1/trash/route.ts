import { NextResponse } from "next/server";
import { requireCtx } from "@/server/context";
import { handle } from "@/server/errors";
import { listTrash } from "@/server/files";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    return NextResponse.json({ items: await listTrash(await requireCtx(req)) });
  } catch (e) {
    return handle(e);
  }
}
