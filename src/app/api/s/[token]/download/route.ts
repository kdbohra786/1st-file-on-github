import { NextResponse } from "next/server";
import { z } from "zod";
import { handle } from "@/server/errors";
import { noStore, requirePublicLink } from "@/server/public-request";
import { publicSignedUrl, recordVisit } from "@/server/shares";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  try {
    const { token } = await params;
    const { link, bucket, info } = await requirePublicLink(req, token, { needUnlock: true });
    const { nodeId } = z.object({ nodeId: z.string().uuid().optional() }).parse(await req.json().catch(() => ({})));
    const out = await publicSignedUrl(link, bucket, nodeId, "download");
    if ("download" === "download") await recordVisit(link, "download", info);
    return noStore(NextResponse.json(out));
  } catch (e) {
    return noStore(handle(e));
  }
}
