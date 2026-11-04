// Real-browser check of the file manager. Requires: dev stack + `npm run dev`. Run: node scripts/e2e-ui.mjs
import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";

const BASE = process.env.E2E_BASE ?? "http://localhost:3000";
let failed = 0;
const ok = (c, name) => {
  if (!c) failed++;
  console.log(`  ${c ? "PASS" : "FAIL"}  ${name}`);
};

async function login(page, email, password) {
  await page.goto(`${BASE}/login`);
  await page.fill('input[name="email"]', email);
  await page.fill('input[name="password"]', password);
  await page.click('button:has-text("Sign in")');
  await page.waitForURL(/\/(app|company|admin)/, { timeout: 15000 });
}

(async () => {
  const browser = await chromium.launch();
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ui-e2e-"));
  const big = path.join(tmp, "big-upload.bin");
  fs.writeFileSync(big, Buffer.alloc(20 * 1024 * 1024, 7)); // 3 parts at 8 MB
  const note = path.join(tmp, "note.txt");
  fs.writeFileSync(note, "hello from the browser");

  console.log("member 1 (Contributor)");
  const ctx1 = await browser.newContext();
  const p1 = await ctx1.newPage();
  const consoleErrors = [];
  p1.on("console", (m) => m.type() === "error" && consoleErrors.push(m.text()));
  await login(p1, "member1@demo.infinitivecloud.com", "Member1@Bucket#2026");
  await p1.waitForSelector('[data-testid="file-input"]', { state: "attached" });
  ok((await p1.locator('button:has-text("Upload")').count()) === 1, "Upload button visible (has upload)");
  ok((await p1.locator('button:has-text("New folder")').count()) === 0, "New folder hidden (no manage_folders)");
  await p1.setInputFiles('[data-testid="file-input"]', [big, note]);
  await p1.waitForSelector('[data-testid="upload"]:has-text("Done") >> nth=1', { timeout: 60000 });
  ok(true, "both uploads reached Done (browser -> SeaweedFS, multipart, ETag via CORS)");
  ok((await p1.locator('[data-testid="row"]:has-text("big-upload.bin")').count()) === 1, "big file listed");
  ok((await p1.locator('[data-testid="row"]:has-text("note.txt")').count()) === 1, "note listed");
  await p1
    .waitForFunction(
      () => /\b(2\d|3\d)(\.\d)? MB of/.test(document.querySelector('[aria-label="Storage usage"]')?.textContent ?? ""),
      null,
      { timeout: 10000 },
    )
    .then(
      () => ok(true, "usage meter updated after upload"),
      async () =>
        ok(
          false,
          "usage meter updated after upload: " + (await p1.locator('[aria-label="Storage usage"]').innerText()),
        ),
    );
  await p1.click('[data-testid="row"]:has-text("note.txt") >> button:has-text("note.txt")');
  await p1.waitForSelector('[role="dialog"] pre');
  ok(
    (await p1.locator('[role="dialog"] pre').innerText()).includes("hello from the browser"),
    "text preview renders file content",
  );
  await p1.click('[role="dialog"] >> button:has-text("Close")');
  const [download] = await Promise.all([
    p1.waitForEvent("download"),
    p1.click('[data-testid="row"]:has-text("note.txt") >> button:has-text("Download")'),
  ]);
  const dlPath = await download.path();
  ok(fs.readFileSync(dlPath, "utf8") === "hello from the browser", "browser download returns the same content");
  ok((await p1.locator('button:has-text("Delete")').count()) === 0, "Delete hidden (no delete permission)");
  ok(!consoleErrors.some((e) => /CORS|blocked/i.test(e)), "no CORS errors in console");

  console.log("member 2 (Viewer on Accounts)");
  const ctx2 = await browser.newContext();
  const p2 = await ctx2.newPage();
  await login(p2, "member2@demo.infinitivecloud.com", "Member2@Bucket#2026");
  await p2.waitForSelector("text=Accounts");
  ok((await p2.locator('[data-testid="row"]:has-text("Accounts")').count()) === 1, "sees the Accounts shared folder");
  ok(
    (await p2.locator('[data-testid="row"]:has-text("big-upload.bin")').count()) === 0,
    "does not see member 1's files",
  );
  await p2.click('button:has-text("Accounts")');
  await p2.waitForSelector('[aria-label="Breadcrumb"] >> text=Accounts');
  ok((await p2.locator('button:has-text("Upload")').count()) === 0, "Upload hidden for viewer");

  console.log("route guard");
  await p2.goto(`${BASE}/admin`);
  ok(/\/app/.test(p2.url()), "member redirected away from /admin");

  console.log(failed ? `\n${failed} FAILED` : "\nAll UI checks passed");
  await browser.close();
  process.exit(failed ? 1 : 0);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
