import "dotenv/config";
import { getSql } from "../src/db/client";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
let failed = 0;
const ok = (c: unknown, name: string, extra = "") => {
  if (!c) failed++;
  console.log(`  ${c ? "PASS" : "FAIL"}  ${name}${!c && extra ? ` (${extra})` : ""}`);
};

class Client {
  cookies = new Map<string, string>();
  private jar = () => [...this.cookies].map(([k, v]) => `${k}=${v}`).join("; ");
  private store(res: Response) {
    for (const c of res.headers.getSetCookie()) {
      const [kv] = c.split(";");
      const i = kv.indexOf("=");
      this.cookies.set(kv.slice(0, i), kv.slice(i + 1));
    }
  }
  async login(email: string, password: string) {
    const r = await fetch(`${BASE}/api/auth/csrf`);
    this.store(r);
    const { csrfToken } = await r.json();
    const res = await fetch(`${BASE}/api/auth/callback/credentials`, {
      method: "POST",
      redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: this.jar() },
      body: new URLSearchParams({ csrfToken, email, password }),
    });
    this.store(res);
  }
  async api(method: string, path: string, body?: unknown) {
    const res = await fetch(`${BASE}/api/v1${path}`, {
      method,
      headers: { cookie: this.jar(), ...(body ? { "content-type": "application/json" } : {}) },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, json: text ? JSON.parse(text) : null };
  }
  async upload(parentId: string, name: string, data: Buffer) {
    const init = await this.api("POST", "/uploads", { parentId, name, size: data.length, contentType: "text/plain" });
    if (init.status !== 201) return { init };
    const { uploadSessionId, partSize, partCount } = init.json;
    const parts = [];
    for (let n = 1; n <= partCount; n++) {
      const signed = await this.api("POST", `/uploads/${uploadSessionId}/sign-part`, { partNumber: n });
      const put = await fetch(signed.json.url, {
        method: "PUT",
        body: new Uint8Array(data.subarray((n - 1) * partSize, n * partSize)),
      });
      parts.push({ PartNumber: n, ETag: put.headers.get("etag")! });
    }
    const done = await this.api("POST", `/uploads/${uploadSessionId}/complete`, { parts });
    return { init, done };
  }
}

async function main() {
  const sql = getSql();
  // Reset: drop files/folders created by earlier runs (keeps home folders + the seeded Accounts folder).
  await sql`DELETE FROM upload_sessions`;
  await sql`DELETE FROM nodes WHERE parent_id IS NOT NULL AND tenant_id IN (SELECT id FROM tenants WHERE slug LIKE 'acme-demo%' OR type = 'individual')`;
  await sql`UPDATE tenants SET used_bytes = 0, status = 'active' WHERE slug LIKE 'acme-demo%' OR type = 'individual'`;
  await sql`UPDATE users SET must_change_password = false WHERE email LIKE '%@demo.infinitivecloud.com'`;

  const m1 = new Client(),
    m2 = new Client(),
    ind = new Client(),
    admin = new Client();
  await m1.login("member1@demo.infinitivecloud.com", "Member1@Bucket#2026");
  await m2.login("member2@demo.infinitivecloud.com", "Member2@Bucket#2026");
  await ind.login("individual@demo.infinitivecloud.com", "Individual@Bucket#2026");
  await admin.login("companyadmin@demo.infinitivecloud.com", "Company@Bucket#2026");

  console.log("auth");
  ok((await new Client().api("GET", "/nodes")).status === 401, "anonymous request -> 401");

  console.log("member 1 (Contributor, own folder)");
  const roots1 = (await m1.api("GET", "/nodes")).json.items;
  ok(
    roots1.length === 1,
    "sees exactly their home folder",
    JSON.stringify(roots1.map((r: { name: string }) => r.name)),
  );
  const home1 = roots1[0].id;
  const data = Buffer.from("x".repeat(9 * 1024 * 1024) + "end"); // 2 parts (8 MB part size)
  const up = await m1.upload(home1, "report.txt", data);
  ok(up.done?.status === 200, "multipart upload (2 parts) completes", JSON.stringify(up.done?.json ?? up.init));
  const list1 = (await m1.api("GET", `/nodes?parentId=${home1}`)).json.items;
  const file = list1.find((n: { name: string }) => n.name === "report.txt");
  ok(file && file.status === "ready", "file listed and ready");
  const dl = await m1.api("GET", `/nodes/${file.id}/download`);
  const got = Buffer.from(await (await fetch(dl.json.url)).arrayBuffer());
  ok(got.equals(data), "download round-trips identical bytes");
  const dupe = await m1.upload(home1, "report.txt", Buffer.from("x"));
  ok(dupe.init.status === 409, "duplicate name -> 409");
  const blocked = await m1.api("POST", "/uploads", {
    parentId: home1,
    name: "evil.exe",
    size: 10,
    contentType: "application/x-msdownload",
  });
  ok(blocked.status === 415, "blocked extension -> 415");
  ok(
    (await m1.api("POST", "/nodes", { parentId: home1, name: "Docs" })).status === 403,
    "contributor cannot create folders -> 403",
  );
  ok((await m1.api("DELETE", `/nodes/${file.id}`)).status === 403, "contributor cannot delete -> 403");

  console.log("isolation");
  ok((await m2.api("GET", `/nodes?parentId=${home1}`)).status === 403, "member 2 listing member 1 home -> 403");
  ok((await m2.api("GET", `/nodes/${file.id}/download`)).status === 403, "member 2 downloading member 1 file -> 403");
  ok((await ind.api("GET", `/nodes/${file.id}/download`)).status === 404, "other tenant (individual) -> 404");
  ok((await ind.api("GET", `/nodes?parentId=${home1}`)).status === 404, "other tenant listing -> 404");
  ok((await ind.api("DELETE", `/nodes/${file.id}`)).status === 404, "other tenant delete -> 404");
  const roots2 = (await m2.api("GET", "/nodes")).json.items;
  ok(
    roots2.length === 1 && roots2[0].name === "Accounts",
    "member 2 sees only Accounts shared folder",
    JSON.stringify(roots2.map((r: { name: string }) => r.name)),
  );
  const accounts = roots2[0].id;
  ok(
    (await m2.upload(accounts, "nope.txt", Buffer.from("hi"))).init.status === 403,
    "viewer cannot upload to Accounts -> 403",
  );

  console.log("company admin (whole bucket)");
  const adminRoots = (await admin.api("GET", "/nodes")).json.items;
  ok(adminRoots.length >= 3, "admin sees all root folders", String(adminRoots.length));
  ok(
    (await admin.upload(accounts, "ledger.txt", Buffer.from("books"))).done?.status === 200,
    "admin uploads into Accounts",
  );
  const accList = (await m2.api("GET", `/nodes?parentId=${accounts}`)).json.items;
  const ledger = accList.find((n: { name: string }) => n.name === "ledger.txt");
  ok(!!ledger, "viewer sees admin's file in Accounts");
  const dl2 = await m2.api("GET", `/nodes/${ledger.id}/download`);
  ok(dl2.status === 200, "viewer can download from Accounts");
  const folder = await admin.api("POST", "/nodes", { parentId: accounts, name: "2026" });
  ok(folder.status === 201, "admin creates folder");
  ok((await admin.api("PATCH", `/nodes/${ledger.id}`, { name: "ledger-v2.txt" })).status === 200, "admin renames");
  ok(
    (await admin.api("PATCH", `/nodes/${ledger.id}`, { parentId: folder.json.node.id })).status === 200,
    "admin moves into folder",
  );
  ok(
    (await admin.api("PATCH", `/nodes/${folder.json.node.id}`, { parentId: folder.json.node.id })).status === 400,
    "cannot move folder into itself",
  );

  console.log("trash / restore");
  ok((await admin.api("DELETE", `/nodes/${folder.json.node.id}`)).status === 204, "folder moved to trash");
  ok(
    ((await m2.api("GET", `/nodes?parentId=${accounts}`)).json.items as { name: string }[]).every(
      (n) => n.name !== "2026",
    ),
    "trashed folder hidden",
  );
  ok((await admin.api("PATCH", `/nodes/${folder.json.node.id}`, { restore: true })).status === 200, "restore works");
  ok(
    ((await m2.api("GET", `/nodes?parentId=${accounts}`)).json.items as { name: string }[]).some(
      (n) => n.name === "2026",
    ),
    "restored folder visible again",
  );

  console.log("quota");
  const [t] = await sql`SELECT id, quota_bytes, used_bytes FROM tenants WHERE type='individual' LIMIT 1`;
  const indHome = (await ind.api("GET", "/nodes")).json.items[0].id;
  await sql`UPDATE tenants SET quota_bytes = used_bytes + 1000 WHERE id = ${t.id}`;
  const over = await ind.upload(indHome, "big.txt", Buffer.alloc(5000, 1));
  ok(
    over.init.status === 413 && over.init.json.error.code === "quota_exceeded",
    "upload over quota refused (413, clear message)",
    over.init.json?.error?.message,
  );
  const fits = await ind.upload(indHome, "small.txt", Buffer.alloc(500, 1));
  ok(fits.done?.status === 200, "upload within quota allowed");
  const usage = (await ind.api("GET", "/usage")).json;
  ok(usage.usedBytes === Number(t.used_bytes) + 500, "used_bytes updated", JSON.stringify(usage));
  await sql`UPDATE tenants SET quota_bytes = ${t.quota_bytes} WHERE id = ${t.id}`;

  console.log("read-only plan");
  await sql`UPDATE tenants SET status = 'read_only' WHERE id = ${t.id}`;
  const ro = await ind.api("POST", "/nodes", { parentId: indHome, name: "x" });
  ok(ro.status === 403 && ro.json.error.code === "read_only", "read-only tenant blocks writes");
  ok((await ind.api("GET", `/nodes?parentId=${indHome}`)).status === 200, "read-only tenant still reads");
  await sql`UPDATE tenants SET status = 'active' WHERE id = ${t.id}`;

  console.log(failed ? `\n${failed} FAILED` : "\nAll API checks passed");
  await sql.end();
  process.exit(failed ? 1 : 0);
}
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
