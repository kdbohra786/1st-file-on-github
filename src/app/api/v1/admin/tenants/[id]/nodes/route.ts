import { z } from "zod";
import { adminRoute } from "@/server/route";
import { adminListNodes } from "@/server/admin";

export const dynamic = "force-dynamic";

export const GET = adminRoute<{ id: string }>(async (a, req, p) => {
  const parent = new URL(req.url).searchParams.get("parentId");
  return {
    items: await adminListNodes(a, z.string().uuid().parse(p.id), parent ? z.string().uuid().parse(parent) : null),
  };
});
