import { z } from "zod";
import { adminRoute } from "@/server/route";
import { adminSignDownload } from "@/server/admin";

export const dynamic = "force-dynamic";

export const GET = adminRoute<{ id: string; nodeId: string }>(async (a, _r, p) =>
  adminSignDownload(a, z.string().uuid().parse(p.id), z.string().uuid().parse(p.nodeId)),
);
