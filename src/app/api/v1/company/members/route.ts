import { z } from "zod";
import { companyRoute } from "@/server/route";
import { createMember, listMembers } from "@/server/company";
import { TEMPLATES } from "@/lib/permissions";

export const dynamic = "force-dynamic";
export const GET = companyRoute(async (c) => listMembers(c));
export const POST = companyRoute(async (c, req) => {
  const b = z
    .object({
      name: z.string().trim().min(1).max(100),
      email: z.string().trim().email().max(254),
      template: z.enum(Object.keys(TEMPLATES) as [string, ...string[]]).default("Contributor"),
    })
    .parse(await req.json());
  return createMember(c, { ...b, template: b.template as keyof typeof TEMPLATES });
}, 201);
