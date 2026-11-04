// Real-browser Super Admin flows. Requires dev stack + `npm run dev`; run test:api first (it resets demo data).
import "dotenv/config";
import { chromium } from "playwright";
import postgres from "postgres";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
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

await sql`DELETE FROM rate_limits`; // test hygiene: earlier runs may have used up per-IP limits
await sql`UPDATE users SET must_change_password = false WHERE email IN ('superadmin@infinitivecloud.com','companyadmin@demo.infinitivecloud.com')`;

const browser = await chromium.launch();
async function loginAs(email, password) {
  const page = await (await browser.newContext({ acceptDownloads: true })).newPage();
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("Sign in")');
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
      return { status: r.status, json: t ? JSON.parse(t) : null };
    },
    [method, p, body],
  );

const admin = await loginAs("superadmin@infinitivecloud.com", "Super@Bucket#2026");
await admin.waitForURL(/\/admin/, { timeout: 20000 });
await admin.waitForLoadState("networkidle");
const aApi = apiFrom(admin);

console.log("dashboard");
await admin.waitForSelector('[data-testid="stat"]');
const stats = await admin.locator('[data-testid="stat"]').allInnerTexts();
ok(stats.length === 8, `8 stat tiles (${stats.length})`);
ok(
  stats.some((s) => /System health\s*OK/i.test(s.replace(/\n/g, " "))),
  "system health OK (DB + storage reachable)",
);
ok(await seen(admin.locator("text=Top accounts by usage")), "top accounts table present");

console.log("companies: list and create");
await admin.goto(`${BASE}/admin/tenants?type=company`);
await admin.waitForLoadState("networkidle");
ok(await seen(admin.locator('[data-testid="tenants"] >> text=Acme Demo Pvt Ltd')), "demo company listed");
await admin.fill('input[aria-label="Search"]', "acme");
ok(await seen(admin.locator('[data-testid="tenants"] >> text=Acme Demo Pvt Ltd')), "search finds it");
await admin.fill('input[aria-label="Search"]', "no-such-company-xyz");
ok(await seen(admin.locator("text=Nothing found")), "search with no match shows empty state");
await admin.fill('input[aria-label="Search"]', "");
const coName = `E2E Co ${stamp}`;
const coEmail = `admin-${stamp}@e2e-co.test`;
const form = admin.locator('form[aria-label="Create account"]');
await form.locator('input[name="name"]').fill(coName);
await form.locator('input[name="adminName"]').fill("E2E Admin");
await form.locator('input[name="email"]').fill(coEmail);
await form.locator('select[name="plan"]').selectOption("Starter");
await form.locator('button:has-text("Create account")').click();
await admin.locator('[data-testid="create-result"]').waitFor();
ok(
  /emailed/i.test(await admin.locator('[data-testid="create-result"]').innerText()),
  "UI says the login details were emailed",
);
let tempPw;
for (let i = 0; i < 20 && !tempPw; i++) {
  const list = await (await fetch("http://localhost:8025/api/v1/messages")).json();
  const msg = list.messages.find((m) => m.To.some((t) => t.Address === coEmail));
  if (msg)
    tempPw = (await (await fetch(`http://localhost:8025/api/v1/message/${msg.ID}`)).json()).Text.match(
      /Temporary password: (\S+)/,
    )?.[1];
  else await new Promise((r) => setTimeout(r, 500));
}
ok(!!tempPw, "welcome email arrived in Mailpit with a temporary password");
const co = (await sql`SELECT id, bucket_name, quota_bytes FROM tenants WHERE name = ${coName}`)[0];
ok(!!co && co.bucket_name.startsWith("c-"), "company row and bucket created");
ok(Number(co.quota_bytes) === 100 * 1024 ** 3, "Starter plan quota (100 GB) applied");

console.log("new company admin must change password");
const ca = await loginAs(coEmail, tempPw);
await ca.waitForURL(/\/change-password/, { timeout: 20000 });
ok(true, "first login is forced to /change-password");
await ca.context().close();

console.log("quota change is immediate");
const acme = (await sql`SELECT id, quota_bytes FROM tenants WHERE name = 'Acme Demo Pvt Ltd'`)[0];
const acmeAdmin = await loginAs("companyadmin@demo.infinitivecloud.com", "Company@Bucket#2026");
await acmeAdmin.waitForURL(/\/company/, { timeout: 20000 });
const cApi = apiFrom(acmeAdmin);
const before = (await cApi("GET", "/usage")).json.quotaBytes;
await admin.goto(`${BASE}/admin/tenants/${acme.id}`);
await admin.waitForLoadState("networkidle");
await admin.locator('form[aria-label="Edit account"] input[name="quotaGb"]').fill("500");
await admin.locator('form[aria-label="Edit account"] button:has-text("Save changes")').click();
ok(await seen(admin.locator('[role="status"]:has-text("Saved")')), "quota lowered to 500 GB");
const lowered = (await cApi("GET", "/usage")).json.quotaBytes;
ok(
  before === Number(acme.quota_bytes) && lowered === 500 * 1024 ** 3,
  `company admin sees the new quota at once (${before} -> ${lowered})`,
);
await admin.locator('form[aria-label="Edit account"] input[name="quotaGb"]').fill("1024");
await admin.locator('form[aria-label="Edit account"] button:has-text("Save changes")').click();
await admin.locator('[role="status"]:has-text("Saved")').waitFor();
ok((await cApi("GET", "/usage")).json.quotaBytes === 1024 * 1024 ** 3, "quota raised back to 1 TB, visible at once");

console.log("suspend / reactivate / payments");
await admin.goto(`${BASE}/admin/tenants/${co.id}`);
await admin.waitForLoadState("networkidle");
await admin.locator('form[aria-label="Edit account"] select[name="status"]').selectOption("suspended");
await admin.locator('form[aria-label="Edit account"] button:has-text("Save changes")').click();
await admin.locator('[role="status"]:has-text("Saved")').waitFor();
const blocked = await loginAs(coEmail, tempPw);
await blocked.waitForSelector('[role="alert"]', { timeout: 15000 }).catch(() => {});
ok(
  /\/login/.test(blocked.url()) && (await blocked.locator('[role="alert"]').count()) > 0,
  "suspended company cannot sign in",
);
await blocked.context().close();
await admin.locator('button:has-text("Reactivate")').click();
await admin.locator('[role="status"]:has-text("Reactivated")').waitFor();
const back = await loginAs(coEmail, tempPw);
await back.waitForURL(/\/change-password/, { timeout: 20000 });
ok(true, "reactivated company can sign in again");
await back.context().close();
const pay = admin.locator('form[aria-label="Record payment"]');
await pay.locator('input[name="amount"]').fill("12500.50");
await pay.locator('input[name="paidOn"]').fill("2026-11-01");
await pay.locator('input[name="reference"]').fill(`UTR-${stamp}`);
await pay.locator('button:has-text("Record payment")').click();
ok(await seen(admin.locator(`td:has-text("UTR-${stamp}")`)), "manual payment recorded and listed");

console.log("open any bucket requires a reason");
const noGrant = await aApi("GET", `/admin/tenants/${co.id}/nodes`);
ok(
  noGrant.status === 403 && noGrant.json.error.code === "reason_required",
  "browsing without a reason is refused (403)",
);
const tooShort = await aApi("POST", `/admin/tenants/${co.id}/access`, { reason: "x" });
ok(tooShort.status === 400, "a one-letter reason is refused");
await admin.goto(`${BASE}/admin/tenants/${acme.id}`);
await admin.waitForLoadState("networkidle");
admin.once("dialog", (d) => d.accept(`Support ticket ${stamp}`));
await admin.locator('button:has-text("Open bucket")').click();
ok(await seen(admin.locator('[data-testid="bucket-browser"]')), "bucket opens after a reason is given");
ok(await seen(admin.locator('[data-testid="bucket-browser"] >> text=Accounts')), "customer folders are visible");

console.log("audit log");
await admin.goto(`${BASE}/admin/audit`);
await admin.waitForLoadState("networkidle");
ok(
  await seen(admin.locator(`[data-testid="audit"] >> text=admin.bucket_access`).first()),
  "bucket access is in the audit log",
);
ok(
  await seen(admin.locator(`[data-testid="audit"] >> text=Support ticket ${stamp}`).first()),
  "the stated reason is recorded",
);
await admin.fill('input[aria-label="Action"]', "quota.");
await admin.waitForFunction(
  () =>
    [...document.querySelectorAll('[data-testid="audit"] tbody tr td:nth-child(2)')].every((c) =>
      c.textContent.startsWith("quota."),
    ) && document.querySelectorAll('[data-testid="audit"] tbody tr').length >= 2,
);
ok(true, "action filter narrows to quota changes (at least two)");
const csv = await admin.evaluate(async () => {
  const r = await fetch("/api/v1/admin/audit?format=csv&action=quota.");
  return { type: r.headers.get("content-type"), text: await r.text() };
});
ok(
  csv.type.startsWith("text/csv") && csv.text.startsWith("time,action,actor") && csv.text.includes("quota.change"),
  "CSV export works",
);

console.log("plans");
await admin.goto(`${BASE}/admin/plans`);
await admin.waitForLoadState("networkidle");
const nf = admin.locator('form[aria-label="New plan"]');
await nf.locator('input[name="name"]').fill(`E2E Plan ${stamp}`);
await nf.locator('input[name="quotaGb"]').fill("250");
await nf.locator('input[name="maxUsers"]').fill("10");
await nf.locator('button:has-text("Add plan")').click();
ok(await seen(admin.locator(`[data-testid="plans"] >> text=E2E Plan ${stamp}`)), "new plan appears");

console.log("settings: signup switch");
await aApi("PUT", "/admin/settings", { signup_enabled: false });
const anon = await (await browser.newContext()).newPage();
await anon.goto(`${BASE}/signup`);
await anon.waitForLoadState("networkidle");
await anon.fill('input[name="name"]', "Closed Test");
await anon.fill('input[name="email"]', `closed-${stamp}@example.test`);
await anon.fill('input[name="password"]', "Closed#Test12345");
await anon.click('button:has-text("Create account")');
ok(await seen(anon.locator('[role="alert"]:has-text("closed")')), "signup refused while switched off");
await aApi("PUT", "/admin/settings", { signup_enabled: true });

console.log("access control");
ok((await apiFrom(acmeAdmin)("GET", "/admin/dashboard")).status === 403, "company admin gets 403 on admin API");
ok((await apiFrom(acmeAdmin)("GET", `/admin/tenants`)).status === 403, "company admin cannot list tenants");
await acmeAdmin.goto(`${BASE}/admin`);
ok(/\/company/.test(acmeAdmin.url()), "company admin redirected away from /admin");
const anonApi = await anon.evaluate(async () => (await fetch("/api/v1/admin/dashboard")).status);
ok(anonApi === 401, "anonymous gets 401 on admin API");

console.log("delete account");
await admin.goto(`${BASE}/admin/tenants/${co.id}`);
await admin.waitForLoadState("networkidle");
admin.once("dialog", (d) => d.accept());
await admin.locator('button:has-text("Delete account")').click();
await admin
  .locator('[role="status"]:has-text("deleted")')
  .waitFor({ timeout: 10000 })
  .catch(() => {});
const gone = (await sql`SELECT status FROM tenants WHERE id = ${co.id}`)[0];
ok(gone.status === "deleted", "company soft-deleted");
await admin.goto(`${BASE}/admin/tenants?type=company`);
await admin.waitForLoadState("networkidle");
await admin.waitForSelector('[data-testid="tenants"] tbody tr');
ok(
  (await admin.locator(`[data-testid="tenants"] >> text=${coName}`).count()) === 0,
  "deleted company no longer listed",
);
const dead = await loginAs(coEmail, tempPw);
await dead.waitForSelector('[role="alert"]', { timeout: 15000 }).catch(() => {});
ok(/\/login/.test(dead.url()), "deleted company cannot sign in");

console.log(failed ? `\n${failed} FAILED` : "\nAll admin checks passed");
await sql.end();
await browser.close();
process.exit(failed ? 1 : 0);
