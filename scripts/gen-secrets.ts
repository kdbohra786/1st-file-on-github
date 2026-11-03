import { randomBytes } from "node:crypto";
const b = (n: number) => randomBytes(n).toString("base64");
console.log(
  `AUTH_SECRET=${b(32)}\nMETRICS_TOKEN=${randomBytes(24).toString("hex")}\nPOSTGRES_PASSWORD=${randomBytes(18).toString("hex")}`,
);
