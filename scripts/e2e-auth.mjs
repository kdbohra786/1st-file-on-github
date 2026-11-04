// Real-browser auth flows: signup, login, forgot/reset password via Mailpit. Requires dev stack + `npm run dev`.
import { chromium } from "playwright";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
const MAILPIT = process.env.MAILPIT ?? "http://localhost:8025";
let failed = 0;
const ok = (c, name) => {
  if (!c) failed++;
  console.log(`  ${c ? "PASS" : "FAIL"}  ${name}`);
};

const email = `e2e-${Date.now()}@example.test`;
const pw1 = "First#Password1";
const pw2 = "Second#Password2";

async function signIn(page, e, p) {
  await page.goto(`${BASE}/login`);
  await page.waitForLoadState("networkidle");
  await page.fill('input[name="email"]', e);
  await page.fill('input[name="password"]', p);
  await page.click('button:has-text("Sign in")');
}

async function resetLinkFor(to) {
  for (let i = 0; i < 20; i++) {
    const list = await (await fetch(`${MAILPIT}/api/v1/messages`)).json();
    const msg = list.messages.find((m) => m.To.some((t) => t.Address === to));
    if (msg) {
      const full = await (await fetch(`${MAILPIT}/api/v1/message/${msg.ID}`)).json();
      return full.Text.match(/https?:\/\/\S+reset-password\?token=\S+/)?.[0];
    }
    await new Promise((r) => setTimeout(r, 500));
  }
}

const browser = await chromium.launch();
const page = await (await browser.newContext()).newPage();

console.log("signup");
await page.goto(`${BASE}/signup`);
await page.waitForLoadState("networkidle");
await page.fill('input[name="name"]', "E2E Person");
await page.fill('input[name="email"]', email);
await page.fill('input[name="password"]', "weak");
await page.click('button:has-text("Create account")');
ok(
  await page
    .locator('[role="alert"]')
    .waitFor({ timeout: 8000 })
    .then(
      () => true,
      () => false,
    ),
  "weak password rejected with a message",
);
await page.fill('input[name="password"]', pw1);
await page.click('button:has-text("Create account")');
await page.waitForURL(/\/login\?registered=1/, { timeout: 30000 });
ok(true, "valid signup creates account (bucket provisioned) and redirects to login");

console.log("login");
await signIn(page, email, "wrong-password");
ok(
  await page
    .locator('[role="alert"]')
    .waitFor({ timeout: 8000 })
    .then(
      () => true,
      () => false,
    ),
  "wrong password shows generic error",
);
await signIn(page, email, pw1);
await page.waitForURL(/\/app/, { timeout: 15000 });
ok(true, "new individual lands in /app without a forced password change");
await page.waitForSelector('[aria-label="Storage usage"]');
ok((await page.locator('[aria-label="Storage usage"]').innerText()).includes("5.0 GB"), "free plan shows 5 GB quota");

console.log("duplicate signup");
const p2 = await (await browser.newContext()).newPage();
await p2.goto(`${BASE}/signup`);
await p2.waitForLoadState("networkidle");
await p2.fill('input[name="name"]', "Again");
await p2.fill('input[name="email"]', email);
await p2.fill('input[name="password"]', pw1);
await p2.click('button:has-text("Create account")');
ok(
  await p2
    .locator('[role="alert"]:has-text("Could not create")')
    .waitFor({ timeout: 8000 })
    .then(
      () => true,
      () => false,
    ),
  "duplicate email refused",
);

console.log("forgot / reset password");
await p2.goto(`${BASE}/forgot-password`);
await p2.waitForLoadState("networkidle");
await p2.fill('input[name="email"]', "nobody-here@example.test");
await p2.click('button:has-text("Send reset link")');
const unknownMsg = await p2.locator('[role="status"]').innerText();
await p2.fill('input[name="email"]', email);
await p2.click('button:has-text("Send reset link")');
await p2.waitForFunction(() => document.querySelector('[role="status"]'));
ok(
  unknownMsg === (await p2.locator('[role="status"]').innerText()),
  "same response for known and unknown emails (no enumeration)",
);
const link = await resetLinkFor(email);
ok(!!link, "reset email arrived in Mailpit with a link");
await p2.goto(link);
await p2.waitForLoadState("networkidle");
await p2.fill('input[name="password"]', "short");
await p2.click('button:has-text("Set new password")');
ok(
  await p2
    .locator('[role="alert"]')
    .waitFor({ timeout: 8000 })
    .then(
      () => true,
      () => false,
    ),
  "weak new password rejected",
);
await p2.fill('input[name="password"]', pw2);
await p2.click('button:has-text("Set new password")');
await p2.waitForURL(/\/login\?reset=1/, { timeout: 15000 });
ok(true, "password reset succeeds");
await signIn(p2, email, pw1);
ok(
  await p2
    .locator('[role="alert"]')
    .waitFor({ timeout: 8000 })
    .then(
      () => true,
      () => false,
    ),
  "old password no longer works",
);
await signIn(p2, email, pw2);
await p2.waitForURL(/\/app/, { timeout: 15000 });
ok(true, "new password works");
const p3 = await (await browser.newContext()).newPage();
await p3.goto(link);
await p3.waitForLoadState("networkidle");
await p3.fill('input[name="password"]', "Third#Password3");
await p3.click('button:has-text("Set new password")');
ok(
  await p3
    .locator('[role="alert"]:has-text("invalid or has expired")')
    .waitFor({ timeout: 8000 })
    .then(
      () => true,
      () => false,
    ),
  "reset link is single-use",
);

console.log(failed ? `\n${failed} FAILED` : "\nAll auth checks passed");
await browser.close();
process.exit(failed ? 1 : 0);
