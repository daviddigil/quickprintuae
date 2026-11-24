// End-to-end business flow against a running server (BASE, default http://localhost:3200)
// started with PAYMENTS_FAKE=1 DELIVERY_FAKE=1 and the demo shop's Mamo enabled.
import { chromium } from "playwright";
import { PDFDocument } from "pdf-lib";
import { writeFileSync } from "fs";

const BASE = process.env.BASE ?? "http://localhost:3200";
const OUT = process.env.OUT ?? ".";
const step = (s) => console.log("✔", s);

const pdf = await PDFDocument.create(); for (let i = 0; i < 3; i++) pdf.addPage([595, 842]);
writeFileSync(`${OUT}/sample.pdf`, await pdf.save());

const browser = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined });
const errors = [];
const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
page.on("pageerror", (e) => errors.push(e.message));

// ---------- customer ----------
await page.goto(`${BASE}/s/demo`);
await page.getByText("Document Printing").first().waitFor();
step("storefront home");
await page.goto(`${BASE}/s/demo/p/document-printing`);
await page.getByTestId("file-input").setInputFiles(`${OUT}/sample.pdf`);
await page.getByText("sample.pdf").waitFor();
await page.getByTestId("add-to-cart").click();
step("uploaded 3-page PDF and added to cart");
await page.goto(`${BASE}/s/demo/checkout`);
await page.fill('input[name="name"]', "Aisha Test");
await page.fill('input[name="email"]', "aisha@example.com");
await page.fill('input[name="phone"]', "+971501234567");
await page.getByTestId("mode-delivery").click();
await page.fill('input[name="area"]', "Business Bay");
await page.fill('input[name="line1"]', "Bay Square 5");
await page.fill('input[name="city"]', "Dubai");
const slots = page.getByTestId("slots");
await slots.locator("button").first().click().catch(() => {});
await page.waitForTimeout(300);
const slotButtons = page.locator('[data-testid="slots"] button');
await slotButtons.nth((await slotButtons.count()) - 1).click();
console.log("  total:", await page.getByTestId("total").innerText());
await page.screenshot({ path: `${OUT}/checkout.png`, fullPage: true });
await page.getByTestId("place-order").click();
await page.waitForURL(/\/orders\//, { timeout: 20000 });
await page.waitForTimeout(1500);
await page.reload({ waitUntil: "networkidle" });
await page.getByText(/Paid|Printing|Awaiting payment/i).first().waitFor({ timeout: 20000 });
const body = await page.locator("body").innerText();
const orderNo = body.match(/[A-Z]{2,4}-\d{4,}/)?.[0];
if (!/Paid|Printing/i.test(body)) throw new Error("order not paid: " + body.slice(0, 400));
await page.screenshot({ path: `${OUT}/order.png`, fullPage: true });
step(`checkout → fake Mamo payment → order ${orderNo} paid`);

// ---------- shop owner ----------
const ctx2 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const admin = await ctx2.newPage(); admin.on("pageerror", (e) => errors.push(e.message));
await admin.goto(`${BASE}/login`);
await admin.fill('input[name="email"]', "owner@demo.ae"); await admin.fill('input[name="password"]', "owner12345");
await admin.getByRole("button", { name: "Sign in" }).click();
await admin.waitForURL(/\/admin/);
step("owner login");
await admin.goto(`${BASE}/admin/orders?q=${orderNo}`);
await admin.getByText(orderNo).first().click();
await admin.waitForURL(/\/admin\/orders\/[0-9a-f-]+/);
await admin.getByText("sample.pdf").first().waitFor();
for (const label of [/Printing|In production/i, /Ready/i]) {
  await admin.getByRole("button", { name: label }).first().click();
  await admin.waitForTimeout(1200);
}
step("moved order to printing → ready");
const book = admin.getByRole("button", { name: /Book/i }).first();
await book.click(); await admin.waitForTimeout(2000);
await admin.reload();
const adminBody = await admin.locator("body").innerText();
if (!/Out for delivery|assigned|booked|Tracking|ref/i.test(adminBody)) throw new Error("delivery not booked");
await admin.screenshot({ path: `${OUT}/admin-order.png`, fullPage: true });
step("courier booked");
const inv = await admin.goto(`${admin.url()}/invoice`);
if (!/Tax Invoice/i.test(await admin.locator("body").innerText())) throw new Error("no tax invoice");
step(`tax invoice renders (${inv.status()})`);

// ---------- superadmin ----------
const ctx3 = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const sa = await ctx3.newPage(); sa.on("pageerror", (e) => errors.push(e.message));
await sa.goto(`${BASE}/login`);
await sa.fill('input[name="email"]', "admin@quickprint.ae"); await sa.fill('input[name="password"]', "change-me-now");
await sa.getByRole("button", { name: "Sign in" }).click();
await sa.waitForURL(/\/superadmin/);
await sa.screenshot({ path: `${OUT}/superadmin.png`, fullPage: true });
step("superadmin login + dashboard");
await sa.goto(`${BASE}/superadmin/tenants`);
await sa.getByText("Demo Print Hub").first().click();
await sa.getByRole("button", { name: /Impersonate/i }).first().click();
await sa.waitForURL(/\/admin/);
await sa.getByText(/Return to superadmin/i).waitFor();
step("impersonating shop owner");
await sa.getByText(/Return to superadmin/i).click();
await sa.waitForURL(/\/superadmin/);
step("returned to superadmin");

await browser.close();
if (errors.length) { console.log("page errors:", errors); process.exit(1); }
console.log("ALL GREEN");
