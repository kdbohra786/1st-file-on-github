import { z } from "zod";
import { companyRoute } from "@/server/route";
import { resetMemberPassword } from "@/server/company";

export const dynamic = "force-dynamic";
export const POST = companyRoute<{ id: string }>(async (c, _r, p) =>
  resetMemberPassword(c, z.string().uuid().parse(p.id)),
);
