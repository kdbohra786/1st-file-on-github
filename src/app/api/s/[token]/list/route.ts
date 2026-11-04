import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/server/errors";
import { noStore, requirePublicLink } from "@/server/public-request";
import { publicChildren } from "@/server/shares";

export const dynamic = "force-dynamic";

export async function GET(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { link } = await requirePublicLink(req, token, { needUnlock: true });
    const folderId = new URL(req.url).searchParams.get("folderId");
    return noStore(
      NextResponse.json({
        items: await publicChildren(link, folderId ? z.string().uuid().parse(folderId) : undefined),
      }),
    );
  } catch (e) {
    return noStore(handle(e));
  }
}
