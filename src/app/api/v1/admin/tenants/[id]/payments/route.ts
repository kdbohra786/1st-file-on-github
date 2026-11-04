import { z } from "zod";
import { adminRoute } from "@/server/route";
import { recordPayment } from "@/server/admin";

export const dynamic = "force-dynamic";

export const POST = adminRoute<{ id: string }>(async (a, req, p) => {
  const b = z
    .object({
      amount: z.number().int().min(0),
      currency: z.string().length(3).default("INR"),
      paidOn: z.string().datetime(),
      reference: z.string().max(120).optional(),
      note: z.string().max(500).optional(),
    })
    .parse(await req.json());
  return recordPayment(a, z.string().uuid().parse(p.id), { ...b, paidOn: new Date(b.paidOn) });
}, 201);
