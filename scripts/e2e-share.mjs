// Real-browser share-link flows. Requires dev stack + `npm run dev`; run test:api first (it resets demo data).
import "dotenv/config";
import { chromium } from "playwright";
import postgres from "postgres";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let failed = 0;
const ok = (c, name) => {
  if (!c) failed++;
  console.log(`  ${c ? "PASS" : "FAIL"}  ${name}`);
};
const seen = (loc, t = 8000) =>
  loc.waitFor({ timeout: t }).then(
    () => true,
    () => false,
  );

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "share-e2e-"));
const doc = path.join(tmp, "secret-plan.txt");
fs.writeFileSync(doc, "the launch plan is blue");
const inner = path.join(tmp, "inside.txt");
fs.writeFileSync(inner, "inside the shared folder");

const browser = await chromium.launch();
const owner = await (await browser.newContext({ acceptDownloads: true })).newPage();
await owner.goto(`${BASE}/login`);
await owner.waitForLoadState("networkidle");
await owner.fill('input[name="email"]', "individual@demo.infinitivecloud.com");
await owner.fill('input[name="password"]', "Individual@Bucket#2026");
await owner.click('button:has-text("Sign in")');
await owner.waitForURL(/\/app/, { timeout: 20000 });
await owner.waitForSelector('[data-testid="file-input"]', { state: "attached" });
const ownerApi = (method, p, body) =>
  owner.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(`/api/v1${u}`, {
        method: m,
        headers: b ? { "content-type": "application/json" } : undefined,
        body: b ? JSON.stringify(b) : undefined,
      });
      return { status: r.status, json: r.status === 204 ? null : await r.json() };
    },
    [method, p, body],
  );

await owner.setInputFiles('[data-testid="file-input"]', doc);
await owner.waitForSelector('[data-testid="upload"]:has-text("Done")', { timeout: 30000 });

async function createLink(rowText, opts) {
  await owner.click(`[data-testid="row"]:has-text("${rowText}") >> button:has-text("Share")`);
  const dlg = owner.locator('[role="dialog"]');
  await dlg.waitFor();
  if (opts.password) await dlg.locator('input[type="password"]').fill(opts.password);
  if (opts.max) await dlg.locator('input[type="number"]').fill(String(opts.max));
  if (opts.viewOnly) await dlg.locator('input[type="checkbox"]').uncheck();
  await dlg.locator('button:has-text("Create link")').click();
  const url = (await dlg.locator('[data-testid="created-link"]').innerText()).split(/\s/)[0];
  return { url, dlg };
}

console.log("password-protected link with download limit");
const a = await createLink("secret-plan.txt", { password: "share-pass-1", max: 2 });
ok(/\/s\/[A-Za-z0-9_-]{40,}/.test(a.url), "link has a long random token");
await a.dlg.locator('button:has-text("Close")').click();

const anon = await (await browser.newContext({ acceptDownloads: true })).newPage();
await anon.goto(a.url);
await anon.waitForLoadState("networkidle");
ok(await seen(anon.locator("text=password protected")), "anonymous visitor sees the password gate");
ok((await anon.locator("text=secret-plan.txt").count()) === 0, "file name not revealed before unlocking");
const noPwApi = await anon.evaluate(
  async (u) =>
    (
      await fetch(u.replace("/s/", "/api/s/") + "/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    ).status,
  a.url,
);
ok(noPwApi === 401, "download API refuses without unlocking (401)");
await anon.fill('input[name="password"]', "wrong");
await anon.click('button:has-text("Unlock")');
ok(await seen(anon.locator('[role="alert"]:has-text("Incorrect")')), "wrong password rejected");
await anon.fill('input[name="password"]', "share-pass-1");
await anon.click('button:has-text("Unlock")');
ok(await seen(anon.locator('button:has-text("Download")')), "correct password unlocks the page");
for (let i = 1; i <= 2; i++) {
  const [d] = await Promise.all([
    anon.waitForEvent("download", { timeout: 15000 }),
    anon.click('button:has-text("Download")'),
  ]);
  ok(
    fs.readFileSync(await d.path(), "utf8") === "the launch plan is blue",
    `download ${i} of 2 returns the right bytes`,
  );
}
await anon.goto(a.url);
ok(await seen(anon.locator("text=reached its download limit")), "third visit: download limit reached");

console.log("view-only link, analytics, revoke");
const b = await createLink("secret-plan.txt", { viewOnly: true });
const v = await (await browser.newContext()).newPage();
await v.goto(b.url);
await v.waitForLoadState("networkidle");
ok(await seen(v.locator("text=View only")), "view-only notice shown");
ok((await v.locator('button:has-text("Download")').count()) === 0, "no Download button");
ok(await seen(v.locator('button:has-text("Preview")')), "Preview available");
const noDl = await v.evaluate(
  async (u) =>
    (
      await fetch(u.replace("/s/", "/api/s/") + "/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: "{}",
      })
    ).status,
  b.url,
);
ok(noDl === 403, "download API refuses on a view-only link (403)");
await b.dlg.locator('button:has-text("Stats") >> nth=0').click();
ok(await seen(b.dlg.locator('[data-testid="stats"]')), "owner sees link stats");
const stats = await b.dlg.locator('[data-testid="stats"]').first().innerText();
ok(/\d+ views/.test(stats), `stats show visits (${stats.slice(0, 50)})`);
await b.dlg.locator('[data-testid="link-row"]').first().locator('button:has-text("Revoke")').click();
await b.dlg.locator("text=Revoked").first().waitFor();
await v.goto(b.url);
ok(await seen(v.locator("text=has been revoked")), "revoked link stops working");
await b.dlg.locator('button:has-text("Close")').click();

console.log("expiry, suspension, trash");
const c = await createLink("secret-plan.txt", {});
const token = c.url.split("/s/")[1];
await c.dlg.locator('button:has-text("Close")').click();
await sql`UPDATE share_links SET expires_at = now() - interval '1 minute' WHERE token = ${token}`;
await v.goto(c.url);
ok(await seen(v.locator("text=has expired")), "expired link refused");
await sql`UPDATE share_links SET expires_at = NULL WHERE token = ${token}`;
await v.goto(c.url);
ok(await seen(v.locator('button:has-text("Download")')), "link works again once expiry cleared");
await sql`UPDATE tenants SET status = 'suspended' WHERE id = (SELECT tenant_id FROM share_links WHERE token = ${token})`;
await v.goto(c.url);
ok(await seen(v.locator("text=no longer available")), "suspended tenant blocks the link");
await sql`UPDATE tenants SET status = 'active' WHERE id = (SELECT tenant_id FROM share_links WHERE token = ${token})`;
const fileId = (await sql`SELECT node_id FROM share_links WHERE token = ${token}`)[0].node_id;
await ownerApi("DELETE", `/nodes/${fileId}`);
await v.goto(c.url);
ok(await seen(v.locator("text=no longer available")), "trashed file blocks the link");
await ownerApi("PATCH", `/nodes/${fileId}`, { restore: true });
await v.goto(c.url);
ok(await seen(v.locator('button:has-text("Download")')), "restored file works again");

console.log("folder link");
owner.once("dialog", (d) => d.accept("Shared Box"));
await owner.reload();
await owner.waitForSelector('[data-testid="row"]');
const home = (await ownerApi("GET", "/nodes")).json.items[0].id;
const mk = await ownerApi("POST", "/nodes", { parentId: home, name: "Pub" });
ok(mk.status === 201 || mk.status === 409, "folder ready");
await owner.reload();
await owner.waitForSelector('[data-testid="row"]:has-text("Pub")');
await owner.click('[data-testid="row"] >> button:has-text("Pub")');
await owner.waitForSelector('[aria-label="Breadcrumb"] >> text=Pub');
await owner.setInputFiles('[data-testid="file-input"]', inner);
await owner.waitForSelector('[data-testid="upload"]:has-text("Done")', { timeout: 30000 });
await owner.click('[aria-label="Breadcrumb"] >> button:has-text("My Files")');
await owner.waitForSelector('[data-testid="row"]:has-text("Pub")');
const f = await createLink("Pub", {});
await f.dlg.locator('button:has-text("Close")').click();
const fp = await (await browser.newContext()).newPage();
await fp.goto(f.url);
await fp.waitForLoadState("networkidle");
await fp.click('button:has-text("Show contents")');
ok(await seen(fp.locator('[data-testid="public-list"] >> text=inside.txt')), "folder link lists its contents");
const outside = await fp.evaluate(
  async ([u, id]) =>
    (
      await fetch(u.replace("/s/", "/api/s/") + "/download", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nodeId: id }),
      })
    ).status,
  [f.url, fileId],
);
ok(outside === 404, "folder link cannot reach files outside the shared folder (404)");

console.log("headers");
const res = await fetch(a.url);
ok((res.headers.get("x-robots-tag") ?? "").includes("noindex"), "X-Robots-Tag: noindex on /s/*");

console.log(failed ? `\n${failed} FAILED` : "\nAll share checks passed");
await sql.end();
await browser.close();
process.exit(failed ? 1 : 0);
