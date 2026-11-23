import { chromium } from "playwright";
import fs from "fs";
const B = "http://localhost:3108", SCR = process.env.SCR;
const fx = JSON.parse(fs.readFileSync(`${SCR}/wi-fixtures.json`, "utf8").trim().split("\n").pop());
const ok = (m) => console.log("✔", m), bad = (m) => { console.log("✘", m); process.exitCode = 1; };
const assert = (c, m) => (c ? ok(m) : bad(m));
const br = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium" });
const errs = [];
async function login(email, pw) {
  const ctx = await br.newContext({ viewport: { width: 1360, height: 1000 } });
  const p = await ctx.newPage(); p.on("pageerror", (e) => errs.push(e.message));
  await p.goto(B + "/login"); await p.fill('input[name="email"]', email); await p.fill('input[name="password"]', pw);
  await p.getByRole("button", { name: "Sign in" }).click(); await p.waitForURL(/admin/, { timeout: 120000 });
  return { ctx, p };
}
const jobStatus = (p, id) => p.locator(`tr[data-job="${id}"]`).getAttribute("data-status").catch(() => null);

const { ctx, p } = await login("owner@demo.ae", "owner12345");
// nav + dashboard card
assert(await p.getByRole("link", { name: "Walk-in queue" }).count() > 0, "nav shows Walk-in queue (growth plan)");
await p.goto(B + "/admin", { waitUntil: "networkidle", timeout: 120000 });
assert(/waiting/.test(await p.getByTestId("dash-walkin").innerText()), "dashboard card: " + (await p.getByTestId("dash-walkin").innerText()).replace(/\s+/g, " ").slice(0, 80));

// page + settings (enable via UI)
await p.goto(B + "/admin/walk-in", { waitUntil: "networkidle", timeout: 120000 });
await p.getByText("Walk-in ordering is switched off").waitFor();
ok("shows 'switched off' notice before enabling");
await p.locator('input[name="enabled"]').check();
await p.fill('input[name="smallJobBoostPages"]', "3"); await p.fill('input[name="fileRetentionHours"]', "12");
await p.getByRole("button", { name: "Save settings" }).click();
await p.getByText("Walk-in settings saved").waitFor(); ok("settings saved via UI");
assert(await p.locator('input[name="smallJobBoostPages"]').inputValue() === "3" && await p.locator('input[name="enabled"]').isChecked(), "settings persisted");
await p.getByText("No print agent connected").waitFor(); ok("warns when enabled but no agent online");

// agent create: key shown once
await p.fill('input[name="name"]', "Front counter PC"); await p.getByTestId("add-agent").click();
await p.getByTestId("agent-key").waitFor();
const key = await p.getByTestId("agent-key").innerText();
assert(/^qpa_[A-Za-z0-9_-]{20,}$/.test(key), "agent key shown once: " + key.slice(0, 10) + "…");
assert((await p.getByTestId("agent-key-box").innerText()).includes("node agent.mjs --server"), "install snippet shown");
await p.reload({ waitUntil: "networkidle" });
assert(!(await p.content()).includes(key), "key is NOT shown again after reload");
assert(await p.locator('[data-agent]').count() === 1, "agent listed with prefix");

// QR
const svg = await p.getByTestId("qr-svg").innerHTML();
assert(svg.includes("<svg") && (await p.getByTestId("walkin-url").innerText()).endsWith("/s/demo/walk-in"), "QR svg + url " + (await p.getByTestId("walkin-url").innerText()));

// queue sections
const sec = async (t) => (await p.getByTestId(t).locator("tbody tr").count());
assert(await sec("sec-printing") === 1 && await sec("sec-next") === 3 && await sec("sec-attention") === 1 && await sec("sec-awaiting") === 1 && await sec("sec-recent") >= 1, "sections: printing 1 / next 3 / attention 1 / awaiting 1 / recent ≥1");
const order = await p.getByTestId("sec-next").locator("tbody tr").evaluateAll((rs) => rs.map((r) => r.getAttribute("data-job")));
assert(order[0] === fx.ids.q2 && order[1] === fx.ids.q1 && order[2] === fx.ids.q3, "queue order = priority desc, then FIFO (high, old, newer)");
assert(await p.locator(`tr[data-job="${fx.ids.manual}"]`).innerText().then((t) => /pages unverified/.test(t)), "pages-unverified badge shown");
assert(await p.locator(`tr[data-job="${fx.ids.awaiting}"] [title="Paid"]`).count() === 0, "unpaid job shows no paid tick");
await p.screenshot({ path: `${SCR}/wi-1-queue.png`, fullPage: true });

// bump q3 (last) -> goes to top within 4s window (we click and expect immediate refresh)
await p.locator(`tr[data-job="${fx.ids.q3}"] button[data-action="bump"]`).click();
await p.waitForFunction((id) => document.querySelector('[data-testid="sec-next"] tbody tr')?.getAttribute("data-job") === id, fx.ids.q3, { timeout: 8000 });
ok("bump: job moved to top and shows Urgent");
assert(/Urgent/.test(await p.locator(`tr[data-job="${fx.ids.q3}"]`).innerText()), "priority badge = Urgent");
// cancel q1
p.once("dialog", (d) => d.accept());
await p.locator(`tr[data-job="${fx.ids.q1}"] button[data-action="cancel"]`).click();
await p.waitForFunction((id) => !document.querySelector(`tr[data-job="${id}"]`), fx.ids.q1, { timeout: 8000 }); ok("cancel: job removed from queue");
// reprint printed
await p.locator(`tr[data-job="${fx.ids.printed}"] button[data-action="reprint"]`).click();
await p.waitForFunction((id) => document.querySelector(`[data-testid="sec-next"] tr[data-job="${id}"]`), fx.ids.printed, { timeout: 8000 }); ok("reprint: printed job back in 'Up next'");
// mark printed (manual)
await p.locator(`tr[data-job="${fx.ids.manual}"] button[data-action="mark_printed"]`).click();
await p.waitForFunction((id) => document.querySelector(`[data-testid="sec-recent"] tr[data-job="${id}"]`), fx.ids.manual, { timeout: 8000 }); ok("mark printed: needs-attention job moved to Recently printed");

// live polling: external change appears within ~4s without interaction
const { execSync } = await import("child_process");
execSync(`psql postgres://qp:qp@localhost:5432/quickprint -c "update print_jobs set status='printed', finished_at=now() where id='${fx.ids.printing}'"`);
const t0 = Date.now();
await p.waitForFunction((id) => document.querySelector(`[data-testid="sec-recent"] tr[data-job="${id}"]`), fx.ids.printing, { timeout: 9000 });
ok(`live update arrived by polling in ${((Date.now() - t0) / 1000).toFixed(1)}s`);

// download link + wa link
assert((await p.locator(`tr[data-job="${fx.ids.q2}"] a[href^="/api/v1/admin/files/"]`).count()) === 1, "download-file link present");
assert((await p.locator(`tr[data-job="${fx.ids.q2}"] a[href^="https://wa.me/"]`).count()) === 1, "wa.me link present");

// isolation: other shop's job -> 404; audit rows
const r = await ctx.request.post(`${B}/api/v1/admin/walk-in/jobs/${fx.ids.otherJob}`, { data: { action: "cancel" } });
assert(r.status() === 404, "other shop's job id → 404 (got " + r.status() + ")");
const bad1 = await ctx.request.post(`${B}/api/v1/admin/walk-in/jobs/${fx.ids.q2}`, { data: { action: "explode" } });
assert(bad1.status() === 400, "invalid action → 400");
const again = await ctx.request.post(`${B}/api/v1/admin/walk-in/jobs/${fx.ids.q1}`, { data: { action: "bump" } });
assert(again.status() === 409, "bump on a cancelled job → 409");
const audits = execSync(`psql postgres://qp:qp@localhost:5432/quickprint -tAc "select string_agg(distinct action, ',') from audit_logs where action like 'walkin.%'"`).toString().trim();
assert(/walkin\.job\.bump/.test(audits) && /walkin\.job\.cancel/.test(audits) && /walkin\.agent\.create/.test(audits) && /walkin\.settings/.test(audits), "audit log: " + audits);

// order detail: walk-in badge + print jobs card; orders list filter
const orderId = execSync(`psql postgres://qp:qp@localhost:5432/quickprint -tAc "select order_id from print_jobs where id='${fx.ids.q2}'"`).toString().trim();
await p.goto(`${B}/admin/orders/${orderId}`, { waitUntil: "networkidle", timeout: 120000 });
assert(await p.getByTestId("order-print-jobs").count() === 1 && /Walk-in W-103/.test(await p.locator("h1").innerText()), "order detail: walk-in badge + Print jobs card");
await p.screenshot({ path: `${SCR}/wi-2-order.png`, fullPage: true });
await p.getByTestId("order-print-jobs").getByRole("button", { name: "Mark printed" }).click();
await p.getByTestId("order-print-jobs").getByText("printed", { exact: true }).waitFor({ timeout: 8000 }); ok("order detail: action button works + refreshes");
await p.goto(`${B}/admin/orders?source=walk_in`, { waitUntil: "networkidle" });
const rowsWalk = await p.locator("tbody tr").count();
await p.goto(`${B}/admin/orders?source=online`, { waitUntil: "networkidle" });
assert(rowsWalk >= 7 && !(await p.locator("tbody").innerText()).includes("Walk-in W-"), `orders filter: walk-in (${rowsWalk} rows) vs online (no walk-in badges)`);

// customers
await p.goto(`${B}/admin/customers`, { waitUntil: "networkidle" });
const wc = await p.getByTestId("walkin-customers").innerText();
assert(/\+971501110003/.test(wc) && /Layla High/.test(wc), "customers page lists walk-in customers by phone");
await p.goto(`${B}/admin/customers?q=1110005`, { waitUntil: "networkidle" });
assert(/Mariam/.test(await p.getByTestId("walkin-customers").innerText()) && !/Layla/.test(await p.getByTestId("walkin-customers").innerText()), "customers search by phone filters walk-ins");
await p.screenshot({ path: `${SCR}/wi-3-customers.png`, fullPage: true });

// poster
await p.goto(`${B}/admin/walk-in/poster`, { waitUntil: "networkidle" });
assert(await p.getByTestId("poster-qr").locator("svg").count() === 1 && /Scan to print/.test(await p.getByTestId("poster").innerText()) && /Nexsofture Tech/.test(await p.getByTestId("poster").innerText()), "poster: big QR + 'Scan to print' + Powered by");
await p.screenshot({ path: `${SCR}/wi-4-poster.png`, fullPage: true });
await p.pdf({ path: `${SCR}/wi-poster.pdf`, format: "A4", printBackground: true });

// revoke agent
await p.goto(B + "/admin/walk-in", { waitUntil: "networkidle" });
await p.getByRole("button", { name: "Revoke" }).click(); await p.getByText("revoked — its key no longer works").waitFor(); ok("agent revoked");
await p.goto(B + "/admin/walk-in", { waitUntil: "networkidle" }); await p.screenshot({ path: `${SCR}/wi-5-page-full.png`, fullPage: true });

// staff (non-owner) can't change settings/agents; Starter plan sees upgrade card
const staffEmail = `staff${Date.now()}@demo.ae`;
execSync(`cd ${process.cwd()} && psql postgres://qp:qp@localhost:5432/quickprint -c "insert into users (tenant_id, role, email, password_hash, name) select id, 'staff', '${staffEmail}', (select password_hash from users where email='owner@demo.ae'), 'Staff Fx' from tenants where slug='demo'"`);
const staff = await login(staffEmail, "owner12345");
await staff.p.goto(B + "/admin/walk-in", { waitUntil: "networkidle" });
assert(await staff.p.getByRole("button", { name: "Save settings" }).count() === 0 && await staff.p.getByTestId("add-agent").count() === 0, "staff: no settings/agent controls (owner-only)");
assert(await staff.p.getByTestId("walkin-queue").count() === 1, "staff can still see and operate the queue");
await staff.ctx.close();
execSync(`psql postgres://qp:qp@localhost:5432/quickprint -c "delete from users where email='${staffEmail}'"`);

const st = await login(fx.starterEmail, "pw123456");
assert(await st.p.getByRole("link", { name: "Walk-in queue" }).count() === 0, "starter plan: nav entry hidden");
await st.p.goto(B + "/admin/walk-in", { waitUntil: "networkidle" });
assert(await st.p.getByTestId("walkin-locked").count() === 1, "starter plan: /admin/walk-in shows upgrade card (no crash)");
await st.p.screenshot({ path: `${SCR}/wi-6-locked.png` });
assert((await st.ctx.request.get(`${B}/api/v1/admin/walk-in/queue`)).status() === 403, "starter plan: queue API → 403");
assert((await st.ctx.request.post(`${B}/api/v1/admin/walk-in/jobs/${fx.ids.q2}`, { data: { action: "cancel" } })).status() === 403, "starter plan: job action API → 403");
await st.p.goto(B + "/admin", { waitUntil: "networkidle" }); assert(await st.p.getByTestId("dash-walkin").count() === 0, "starter plan: no dashboard card");

await br.close();
console.log(errs.length ? "PAGE ERRORS: " + errs.join(" | ") : "no page errors");
