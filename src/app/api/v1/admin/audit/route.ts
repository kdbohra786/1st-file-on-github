import { NextResponse } from "next/server";
import { adminRoute } from "@/server/route";
import { auditToCsv, parseAuditQuery, queryAudit } from "@/server/admin";

export const dynamic = "force-dynamic";

export const GET = adminRoute(async (_a, req) => {
  const { csv, ...q } = parseAuditQuery(req);
  const rows = await queryAudit(csv ? { ...q, limit: 5000 } : q);
  if (!csv) return { items: rows };
  return new NextResponse(auditToCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="audit-log.csv"',
    },
  });
});
