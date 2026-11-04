import { z } from "zod";
import { companyRoute } from "@/server/route";
import { createShared, listShared } from "@/server/company";

export const dynamic = "force-dynamic";
export const GET = companyRoute(async (c) => listShared(c));
export const POST = companyRoute(
  async (c, req) => createShared(c, z.object({ name: z.string().trim().min(1).max(120) }).parse(await req.json()).name),
  201,
);
