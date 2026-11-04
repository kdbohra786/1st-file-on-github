import { z } from "zod";
import { adminRoute } from "@/server/route";
import { getSettings, putSettings } from "@/server/admin";

export const dynamic = "force-dynamic";
export const GET = adminRoute(async () => getSettings());
export const PUT = adminRoute(async (a, req) =>
  putSettings(
    a,
    z
      .object({
        signup_enabled: z.boolean().optional(),
        blocked_extensions: z
          .array(z.string().regex(/^\.[a-z0-9]{1,10}$/))
          .max(200)
          .optional(),
      })
      .parse(await req.json()),
  ),
);
