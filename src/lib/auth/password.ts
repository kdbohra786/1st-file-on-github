import { hash, verify } from "@node-rs/argon2";

// argon2id (algorithm 2) is the default for @node-rs/argon2
const OPTS = { memoryCost: 19456, timeCost: 2, parallelism: 1 } as const;

export const hashPassword = (pw: string) => hash(pw, OPTS);
export async function verifyPassword(hashed: string, pw: string) {
  try {
    return await verify(hashed, pw);
  } catch {
    return false;
  }
}

export function passwordProblems(pw: string): string[] {
  const p: string[] = [];
  if (pw.length < 10) p.push("at least 10 characters");
  if (!/[a-z]/.test(pw) || !/[A-Z]/.test(pw)) p.push("upper and lower case letters");
  if (!/\d/.test(pw)) p.push("a number");
  return p;
}
