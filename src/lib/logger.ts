import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: ["password", "*.password", "token", "*.token", "authorization", "url"],
});
