import { z } from "zod";
import { adminRoute } from "@/server/route";
import { startBucketAccess } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async (a, req, p) => {
  const { reason } = z
    .object({ reason: z.string().trim().min(5, "Give a reason of at least 5 characters").max(500) })
    .parse(await req.json());
  return startBucketAccess(a, z.string().uuid().parse(p.id), reason);
});
