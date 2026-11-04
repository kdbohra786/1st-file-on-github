import { adminRoute } from "@/server/route";
import { dashboard } from "@/server/admin";

export const dynamic = "force-dynamic";
export const GET = adminRoute(async () => dashboard());
