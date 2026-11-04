import { NextResponse } from "next/server";
import { companyRoute } from "@/server/route";
import { auditToCsv, parseAuditQuery, queryAudit } from "@/server/admin";

export const dynamic = "force-dynamic";

export const GET = companyRoute(async (c, req) => {
  const { csv, tenantId: _ignored, ...q } = parseAuditQuery(req);
  void _ignored; // tenant always comes from the session, never from the query string
  const rows = await queryAudit({ ...q, limit: csv ? 5000 : q.limit, scopeTenantId: c.tenantId });
  if (!csv) return { items: rows };
  return new NextResponse(auditToCsv(rows), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": 'attachment; filename="activity-log.csv"',
    },
  });
});
