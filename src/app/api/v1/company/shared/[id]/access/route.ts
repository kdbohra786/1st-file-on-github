import { z } from "zod";
import { companyRoute } from "@/server/route";
import { setAccess } from "@/server/company";
import { PERMISSIONS } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const PUT = companyRoute<{ id: string }>(async (c, req, p) => {
  const b = z.object({ userId: z.string().uuid(), permissions: z.array(z.enum(PERMISSIONS)) }).parse(await req.json());
  return setAccess(c, z.string().uuid().parse(p.id), b.userId, b.permissions);
});
