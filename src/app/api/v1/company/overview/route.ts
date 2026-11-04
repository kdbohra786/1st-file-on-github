import { companyRoute } from "@/server/route";
import { overview } from "@/server/company";

export const dynamic = "force-dynamic";
export const GET = companyRoute(async (c) => overview(c));
