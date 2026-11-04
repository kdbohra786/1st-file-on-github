import { z } from "zod";
import { companyRoute } from "@/server/route";
import { deleteMember, updateMember } from "@/server/company";
import { PERMISSIONS, TEMPLATES } from "@/lib/permissions";

export const dynamic = "force-dynamic";
type P = { id: string };
const id = (p: P) => z.string().uuid().parse(p.id);

export const PATCH = companyRoute<P>(async (c, req, p) => {
  const b = z
    .object({
      name: z.string().trim().min(1).max(100).optional(),
      status: z.enum(["active", "suspended"]).optional(),
      template: z.enum(Object.keys(TEMPLATES) as [string, ...string[]]).optional(),
      flags: z.array(z.enum(PERMISSIONS)).optional(),
      scope: z.enum(["own", "shared"]).optional(),
      capBytes: z.number().int().min(0).nullable().optional(),
    })
    .parse(await req.json());
  return updateMember(c, id(p), { ...b, template: b.template as keyof typeof TEMPLATES | undefined });
});

export const DELETE = companyRoute<P>(async (c, _r, p) => deleteMember(c, id(p)));
