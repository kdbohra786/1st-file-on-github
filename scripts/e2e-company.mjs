// Real-browser Company Admin flows. Requires dev stack + `npm run dev`; run test:api first (it resets demo data).
import "dotenv/config";
import { chromium } from "playwright";
import postgres from "postgres";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const MAILPIT = process.env.MAILPIT ?? "http://localhost:8025";
const sql = postgres(process.env.DATABASE_URL, { max: 1 });
let failed = 0;
const ok = (c, name) => {
  if (!c) failed++;
  console.log(`  ${c ? "PASS" : "FAIL"}  ${name}`);
};
const seen = (loc, t = 10000) =>
  loc.waitFor({ timeout: t }).then(
    () => true,
    () => false,
  );
const stamp = Date.now();
const memberEmail = `e2e-member-${stamp}@e2e-co.test`;
const memberName = `E2E Member ${stamp}`;
const sharedName = `E2E Shared ${stamp}`;
const finalPw = "Member#Pass12345";

await sql`DELETE FROM rate_limits`;
await sql`UPDATE users SET must_change_password = false WHERE email IN ('companyadmin@demo.infinitivecloud.com','member1@demo.infinitivecloud.com','member2@demo.infinitivecloud.com')`;
await sql`UPDATE tenants SET plan_expires_at = NULL, status = 'active' WHERE name = 'Acme Demo Pvt Ltd'`;
const acme = (await sql`SELECT id, max_users FROM tenants WHERE name = 'Acme Demo Pvt Ltd'`)[0];

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "co-e2e-"));
const small = path.join(tmp, "policy.txt");
fs.writeFileSync(small, "company policy v1");
const twenty = path.join(tmp, "twenty-kb.txt");
fs.writeFileSync(twenty, "x".repeat(20 * 1024));

const browser = await chromium.launch();
async function loginAs(email, password, expect) {
  const page = await (await browser.newContext()).newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("Sign in")');
  if (expect) await page.waitForURL(expect, { timeout: 20000 });
  return page;
}
const apiFrom = (page) => (method, p, body) =>
  page.evaluate(
    async ([m, u, b]) => {
      const r = await fetch(`/api/v1${u}`, {
        method: m,
        headers: b ? { "content-type": "application/json" } : undefined,
        body: b ? JSON.stringify(b) : undefined,
      });
      const t = await r.text();
      let json = null;
      try {
        json = t ? JSON.parse(t) : null;
      } catch {
        /* non-JSON body (e.g. CSV) */
      }
      return { status: r.status, json, text: t, type: r.headers.get("content-type") };
    },
    [method, p, body],
  );
async function mailText(to, since = 0) {
  for (let i = 0; i < 24; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
    const msg = list.messages
      .filter((m) => m.To.some((t) => t.Address === to) && new Date(m.Created).getTime() > since)
      .sort((a, b) => new Date(b.Created) - new Date(a.Created))[0];
    if (msg) return (await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json()).Text;
    await new Promise((r) => setTimeout(r, 500));
  }
}

const admin = await loginAs("companyadmin@demo.infinitivecloud.com", "Company@Bucket#2026", /\/company$/);
await admin.waitForLoadState("networkidle");
const aApi = apiFrom(admin);

console.log("overview");
await admin.waitForSelector('[data-testid="stat"]');
ok((await admin.locator('[data-testid="stat"]').count()) === 4, "four stat tiles");
ok(
  (await admin.locator('[data-testid="expiry-warning"]').count()) === 0,
  "no expiry warning when the plan is far from expiring",
);
await sql`UPDATE tenants SET plan_expires_at = now() + interval '10 days' WHERE id = ${acme.id}`;
await admin.reload();
ok(await seen(admin.locator('[data-testid="expiry-warning"]')), "expiry warning appears when under 30 days remain");
await sql`UPDATE tenants SET plan_expires_at = NULL WHERE id = ${acme.id}`;

console.log("members: create and first login");
await admin.goto(`${BASE}/company/members`);
await admin.waitForLoadState("networkidle");
const form = admin.locator('form[aria-label="Add member"]');
const t0 = Date.now() - 2000;
await form.locator('input[name="name"]').fill(memberName);
await form.locator('input[name="email"]').fill(memberEmail);
await form.locator('select[name="template"]').selectOption("Viewer");
await form.locator('button:has-text("Create member")').click();
ok(await seen(admin.locator('[data-testid="member-msg"]:has-text("emailed")')), "member created, credentials emailed");
ok(await seen(admin.locator(`[data-testid="member-row"]:has-text("${memberEmail}")`)), "member appears in the list");
const welcome = await mailText(memberEmail, t0);
const tempPw = welcome?.match(/Temporary password: (\S+)/)?.[1];
ok(!!tempPw, "welcome email contains a temporary password");
const dup = await aApi("POST", "/company/members", { name: "Dup", email: memberEmail, template: "Viewer" });
ok(dup.status === 409, "duplicate email refused (409)");

const mem = await loginAs(memberEmail, tempPw, /\/change-password/);
ok(true, "member is forced to change the temporary password");
await mem.waitForLoadState("networkidle");
await mem.fill('input[name="current"]', tempPw);
await mem.fill('input[name="next"]', finalPw);
await mem.click('button:has-text("Change password")');
await mem.waitForURL(/\/login/, { timeout: 20000 });
await mem.waitForLoadState("networkidle");
await mem.fill('input[name="email"]', memberEmail);
await mem.fill('input[name="password"]', finalPw);
await mem.click('button:has-text("Sign in")');
await mem.waitForURL(/\/app/, { timeout: 20000 });
await mem.waitForSelector('[data-testid="file-input"], [aria-label="Breadcrumb"]', { state: "attached" });
ok((await mem.locator('button:has-text("Upload")').count()) === 0, "Viewer template: no Upload button");

console.log("permission change takes effect at once");
await admin.reload();
await admin.waitForSelector('[data-testid="member-row"]');
await admin.locator(`[data-testid="member-row"]:has-text("${memberEmail}") >> button:has-text("Permissions")`).click();
const pform = admin.locator(`form[aria-label="Permissions for ${memberName}"]`);
await pform.locator('button:has-text("Contributor")').click();
await pform.locator('button:has-text("Save")').click();
ok(await seen(admin.locator('[data-testid="member-msg"]:has-text("Permissions saved")')), "template applied and saved");
await mem.reload();
ok(await seen(mem.locator('button:has-text("Upload")')), "member now sees Upload without signing in again");
const dl = (
  await sql`SELECT flags FROM member_permissions WHERE user_id = (SELECT id FROM users WHERE email = ${memberEmail})`
)[0];
ok(dl.flags.includes("upload") && !dl.flags.includes("delete"), "flags stored: Contributor (no delete)");

console.log("per-member storage cap");
await admin.locator(`[data-testid="member-row"]:has-text("${memberEmail}") >> button:has-text("Permissions")`).click();
await pform.locator('input[name="cap"]').fill("0.00001");

const [capResp] = await Promise.all([
  admin.waitForResponse((r) => r.url().includes("/api/v1/company/members/") && r.request().method() === "PATCH"),
  pform.locator('button:has-text("Save")').click(),
]);
ok(capResp.status() === 200, "personal cap saved (PATCH 200)");
await mem.reload();
await mem.waitForSelector('[data-testid="file-input"]', { state: "attached" });
await mem.setInputFiles('[data-testid="file-input"]', twenty);
ok(
  await seen(mem.locator('[data-testid="upload"]:has-text("personal storage limit")')),
  "upload over the personal cap refused with a clear message",
);
await mem.locator('button:has-text("Clear")').click();
await aApi("PATCH", `/company/members/${(await sql`SELECT id FROM users WHERE email = ${memberEmail}`)[0].id}`, {
  capBytes: null,
});
await mem.setInputFiles('[data-testid="file-input"]', twenty);
ok(await seen(mem.locator('[data-testid="upload"]:has-text("Done")')), "same upload succeeds once the cap is removed");

console.log("shared folders");
await admin.goto(`${BASE}/company/shared`);
await admin.waitForLoadState("networkidle");
await admin.locator('form[aria-label="New shared folder"] input[name="name"]').fill(sharedName);
await admin.locator('form[aria-label="New shared folder"] button').click();
ok(await seen(admin.locator(`[data-testid="shared-list"] >> text=${sharedName}`)), "shared folder created");
const grant = admin.locator(`form[aria-label="Grant access to ${sharedName}"]`);
await grant.locator("select").selectOption({ label: `${memberName} (${memberEmail})` });
await grant.locator('button:has-text("Grant")').click();
ok(await seen(admin.locator(`text=${memberEmail}): view, download`)), "member granted Viewer on the folder");
await admin.goto(`${BASE}/company/files`);
await admin.waitForSelector(`[data-testid="row"]:has-text("${sharedName}")`);
await admin.click(`[data-testid="row"] >> button:has-text("${sharedName}")`);
await admin.waitForSelector(`[aria-label="Breadcrumb"] >> text=${sharedName}`);
await admin.setInputFiles('[data-testid="file-input"]', small);
await admin.waitForSelector('[data-testid="upload"]:has-text("Done")', { timeout: 30000 });
await mem.reload();
await mem.waitForSelector('[data-testid="row"], [aria-label="Breadcrumb"]');
await mem.click('[aria-label="Breadcrumb"] >> button:has-text("My Files")').catch(() => {});
ok(await seen(mem.locator(`[data-testid="row"]:has-text("${sharedName}")`)), "member sees the shared folder");
await mem.click(`[data-testid="row"] >> button:has-text("${sharedName}")`);
ok(await seen(mem.locator('[data-testid="row"]:has-text("policy.txt")')), "member sees the file the admin put there");
ok(
  (await mem.locator('button:has-text("Upload")').count()) === 0,
  "member has no Upload inside a Viewer-only shared folder",
);
const policyId = (
  await sql`SELECT id FROM nodes WHERE name = 'policy.txt' AND tenant_id = ${acme.id} ORDER BY created_at DESC LIMIT 1`
)[0].id;
const memApi = apiFrom(mem);
ok((await memApi("DELETE", `/nodes/${policyId}`)).status === 403, "member cannot delete in the shared folder (403)");
ok((await memApi("GET", `/nodes/${policyId}/download`)).status === 200, "member can download from it");
await admin.goto(`${BASE}/company/shared`);
await admin.waitForLoadState("networkidle");
await admin
  .locator(`[data-testid="shared-list"] >> text=${memberEmail}`)
  .locator("..")
  .locator('button:has-text("Remove")')
  .click();
await admin.locator(`text=${memberEmail}): view`).waitFor({ state: "detached" });
ok(
  (await memApi("GET", `/nodes/${policyId}/download`)).status === 403,
  "access removed: member is refused immediately (403)",
);

console.log("share links overview");
const link = await aApi("POST", "/shares", { nodeId: policyId, allowDownload: true });
ok(link.status === 201, "admin creates a link on the shared file");
await admin.goto(`${BASE}/company/links`);
await admin.waitForLoadState("networkidle");
ok(
  await seen(admin.locator('[data-testid="link-row"]:has-text("policy.txt")').first()),
  "link visible in the company overview",
);
await admin.locator('[data-testid="link-row"]:has-text("policy.txt") >> button:has-text("Revoke")').first().click();
ok(
  await seen(admin.locator('[data-testid="link-row"]:has-text("policy.txt") >> text=Revoked').first()),
  "admin revokes it",
);

console.log("disable / reset / delete");
const mid = (await sql`SELECT id FROM users WHERE email = ${memberEmail}`)[0].id;
await admin.goto(`${BASE}/company/members`);
await admin.waitForLoadState("networkidle");
await admin.locator(`[data-testid="member-row"]:has-text("${memberEmail}") >> button:has-text("Disable")`).click();
await admin.locator(`[data-testid="member-row"]:has-text("${memberEmail}") >> text=suspended`).waitFor();
const dis = await loginAs(memberEmail, finalPw);
await dis.waitForSelector('[role="alert"]', { timeout: 15000 }).catch(() => {});
ok(/\/login/.test(dis.url()), "disabled member cannot sign in");
await admin.locator(`[data-testid="member-row"]:has-text("${memberEmail}") >> button:has-text("Enable")`).click();
await admin.locator(`[data-testid="member-row"]:has-text("${memberEmail}") >> text=active`).waitFor();
const t1 = Date.now() - 2000;
await admin
  .locator(`[data-testid="member-row"]:has-text("${memberEmail}") >> button:has-text("Reset password")`)
  .click();
ok(await seen(admin.locator('[data-testid="member-msg"]:has-text("emailed")')), "password reset email sent");
const resetPw = (await mailText(memberEmail, t1))?.match(/Temporary password: (\S+)/)?.[1];
ok(!!resetPw && resetPw !== tempPw, "new temporary password differs from the first");
const again = await loginAs(memberEmail, resetPw, /\/change-password/);
ok(true, "after a reset the member must change the password again");
await again.context().close();

console.log("user limit");
const used = (await sql`SELECT COUNT(*)::int AS n FROM users WHERE tenant_id = ${acme.id} AND deleted_at IS NULL`)[0].n;
await sql`UPDATE tenants SET max_users = ${used} WHERE id = ${acme.id}`;
const over = await aApi("POST", "/company/members", {
  name: "Over Limit",
  email: `over-${stamp}@e2e-co.test`,
  template: "Viewer",
});
ok(over.status === 409 && over.json.error.code === "user_limit", "plan user limit enforced (409)");
await sql`UPDATE tenants SET max_users = ${acme.max_users} WHERE id = ${acme.id}`;

console.log("activity log");
await admin.goto(`${BASE}/company/activity`);
await admin.waitForLoadState("networkidle");
ok(
  await seen(admin.locator('[data-testid="audit"] >> text=permission.change').first()),
  "permission changes are logged",
);
ok(await seen(admin.locator('[data-testid="audit"] >> text=user.create').first()), "member creation is logged");
const csv = await aApi("GET", "/company/activity?format=csv");
ok(csv.type.startsWith("text/csv"), "activity CSV export works");
const other = (await sql`SELECT id FROM tenants WHERE id <> ${acme.id} LIMIT 1`)[0].id;
const spoof = await aApi("GET", `/company/activity?tenantId=${other}`);
ok(
  spoof.status === 200 && spoof.json.items.every((r) => r.tenantId === acme.id),
  "tenantId in the query string is ignored: only this company's entries",
);

console.log("isolation and role checks");
const foreignUser = (await sql`SELECT id FROM users WHERE email = 'individual@demo.infinitivecloud.com'`)[0].id;
ok(
  (await aApi("PATCH", `/company/members/${foreignUser}`, { status: "suspended" })).status === 404,
  "cannot modify another company's user (404)",
);
ok(
  (await aApi("POST", `/company/members/${foreignUser}/reset-password`)).status === 404,
  "cannot reset another company's user (404)",
);
ok((await memApi("GET", "/company/members")).status === 403, "a member gets 403 on company APIs");
await mem.goto(`${BASE}/company`);
ok(/\/app/.test(mem.url()), "a member opening /company is sent to /app");

console.log("delete member");
await admin.goto(`${BASE}/company/members`);
await admin.waitForLoadState("networkidle");
admin.once("dialog", (d) => d.accept());
await admin.locator(`[data-testid="member-row"]:has-text("${memberEmail}") >> button:has-text("Delete")`).click();
await admin.locator(`[data-testid="member-row"]:has-text("${memberEmail}")`).waitFor({ state: "detached" });
ok(true, "deleted member disappears from the list");
const gone = (await sql`SELECT deleted_at FROM users WHERE id = ${mid}`)[0];
ok(!!gone.deleted_at, "soft-deleted in the database");

console.log(failed ? `\n${failed} FAILED` : "\nAll company checks passed");
await sql.end();
await browser.close();
process.exit(failed ? 1 : 0);
