import nodemailer from "nodemailer";
import { getEnv } from "@/lib/env";
import { logger } from "@/lib/logger";

/** Returns true if the email was handed to SMTP. When SMTP is not configured, nothing is sent (callers show a fallback). */
export async function sendMail(to: string, subject: string, text: string): Promise<boolean> {
  const e = getEnv();
  if (!e.SMTP_HOST) {
    logger.warn({ subject }, "SMTP not configured; email not sent");
    return false;
  }
  const transport = nodemailer.createTransport({
    host: e.SMTP_HOST,
    port: e.SMTP_PORT,
    secure: e.SMTP_PORT === 465,
    auth: e.SMTP_USER ? { user: e.SMTP_USER, pass: e.SMTP_PASS } : undefined,
  });
  await transport.sendMail({ from: e.SMTP_FROM, to, subject, text });
  return true;
}
