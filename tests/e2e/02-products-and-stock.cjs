const { chromium } = require("playwright");
const { pick } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.argv[2] ?? require("node:os").tmpdir();
const run = Date.now().toString(36);
const ada = `ada2-${run}@example.com`, chidi = `chidi2-${run}@example.com`;
let passed = 0;
const ok = (name) => { passed++; console.log("PASS", name); };
const MAIL = `${process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324"}/api/v1`;

async function confirmationLink(email) {
  for (let i = 0; i < 20; i++) {
    const found = await (await fetch(`${MAIL}/search?query=${encodeURIComponent("to:" + email)}`)).json();
    if (found.messages?.length) {
      const message = await (await fetch(`${MAIL}/message/${found.messages[0].ID}`)).json();
      return (message.HTML || message.Text).match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no confirmation email for " + email);
}
async function signUp(page, name, email, expectUrl) {
  await page.getByLabel("Your full name").fill(name);
  await page.getByLabel("Email", { exact: true }).fill(email);
  await page.getByLabel("Password").fill("correct-horse-9");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText(`We sent a confirmation link to ${email}`).waitFor();
  await page.goto(await confirmationLink(email));
  await page.waitForURL(expectUrl);
}
const nav = (page, name) => page.getByRole("navigation", { name: "Business" }).getByRole("link", { name, exact: true }).click();

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async (viewport) => {
    const page = await (await browser.newContext({ viewport: viewport ?? { width: 1280, height: 800 } })).newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    return page;
  };

  const a = await newPage();
  await a.goto(BASE + "/signup");
  await signUp(a, "Ada Obi", ada, "**/onboarding");
  await a.getByLabel("Business name").fill(`Ada Drinks ${run}`);
  await a.getByText("I count my goods").click();
  await a.getByLabel("Customers bring things back to me").check();
  await a.getByRole("button", { name: "Create business" }).click();
  await a.waitForURL(/\/b\/ada-drinks-/);
  const base = new URL(a.url()).pathname;

  // Products: one with a return, one without
  await nav(a, "Products");
  await a.getByText("No products yet").waitFor();
  await a.getByRole("link", { name: "+ New product" }).click();
  await a.getByLabel("Product name").fill("Cola 50cl");
  await a.getByLabel("Product code (optional)").fill("COLA-50");
  await a.getByLabel(/Selling price/).fill("4200");
  await a.getByLabel(/Buying cost/).fill("3600");
  await a.getByLabel("Warn me when stock falls to").fill("20");
  assert.equal(await a.getByLabel("What must they bring back?").count(), 0, "return field hidden until ticked");
  await a.getByLabel("Customers must bring something back").check();
  await a.getByLabel("What must they bring back?").fill("Empty crate");
  await a.screenshot({ path: `${SHOTS}/10-product-form.png`, fullPage: true });
  await a.getByRole("button", { name: "Save product" }).click();
  await a.waitForURL(new RegExp(base + "/products$"));
  await a.locator("li", { hasText: "Cola 50cl" }).getByText("Return due: Empty crate").waitFor();

  await a.getByRole("link", { name: "+ New product" }).click();
  await a.getByLabel("Product name").fill("cola 50cl");
  await a.getByRole("button", { name: "Save product" }).click();
  await a.getByText("You already have a product called cola 50cl.").waitFor();
  assert.equal(await a.getByLabel("Product name").inputValue(), "cola 50cl", "typed name kept after error");
  await a.getByLabel("Product name").fill("Water 75cl");
  await a.getByLabel("Sold by the").fill("pack");
  await a.getByLabel(/Selling price/).fill("1,800");
  await a.getByRole("button", { name: "Save product" }).click();
  await a.waitForURL(new RegExp(base + "/products$"));
  await a.locator("li", { hasText: "Water 75cl" }).getByText("No return").waitFor();
  await a.locator("li", { hasText: "Water 75cl" }).getByText("Per pack · ₦1,800").waitFor();
  await a.screenshot({ path: `${SHOTS}/11-products.png`, fullPage: true });
  ok("owner creates a product with a return and one without; duplicate name refused");

  // Edit shows saved values including the admin-only cost
  await a.locator("li", { hasText: "Cola 50cl" }).getByRole("link", { name: "Edit" }).click();
  await a.getByRole("heading", { name: "Edit product" }).waitFor();
  // Earlier pages stay in the DOM hidden, so read only the visible form.
  const visible = (locator) => locator.filter({ visible: true });
  assert.equal(await visible(a.getByLabel(/Buying cost/)).inputValue(), "3600");
  assert.equal(await visible(a.getByLabel("What must they bring back?")).inputValue(), "Empty crate");
  assert.equal(await visible(a.getByLabel("Warn me when stock falls to")).inputValue(), "20");
  ok("editing a product shows its saved cost and return item");

  // Customers
  await nav(a, "Customers");
  await a.getByRole("link", { name: "+ New customer" }).click();
  await a.getByLabel("Customer name").fill("Mama Tunde Stores");
  await a.getByLabel("Area (optional)").fill("Ikeja");
  await a.getByLabel("Phone (optional)").fill("0803 000 0000");
  await a.getByRole("button", { name: "Save customer" }).click();
  await a.waitForURL(new RegExp(base + "/customers$"));
  await a.locator("li", { hasText: "Mama Tunde Stores" }).getByText("Ikeja · 0803 000 0000").waitFor();
  ok("owner adds a customer");

  // Stock: starts at zero and low, then receive
  await nav(a, "Stock");
  await a.locator("li", { hasText: "Cola 50cl" }).getByText("Low stock").waitFor();
  await a.getByText("1 product is running low.").waitFor();
  await a.getByRole("link", { name: "+ Receive stock" }).click();
  await a.getByRole("button", { name: "Save and add to stock" }).click();
  await a.getByText("Add at least one product.").waitFor();
  await pick(a, "Product", "Cola 50cl (crate)");
  await a.getByLabel("Quantity").fill("100");
  await a.getByRole("button", { name: "Add another product" }).click();
  await pick(a, "Product 2", "Water 75cl (pack)");
  await a.getByLabel("Quantity").nth(1).fill("40");
  await a.getByLabel("Supplier (optional)").fill("Main supplier");
  await a.screenshot({ path: `${SHOTS}/12-receive-stock.png`, fullPage: true });
  await a.getByRole("button", { name: "Save and add to stock" }).click();
  await a.waitForURL(/\/stock\/receipts\//);
  await a.getByText("Saved. The stock below has been added.").waitFor();
  await a.getByRole("heading", { name: /^STK-\d{8}-0001$/ }).waitFor();
  await a.getByRole("link", { name: "Back to stock" }).click();
  await a.waitForURL(new RegExp(base + "/stock$"));
  const cola = a.locator("li", { hasText: "Cola 50cl" });
  await cola.getByText("100", { exact: true }).waitFor();
  assert.equal(await cola.getByText("Low stock").count(), 0, "no longer low after receiving");
  await a.locator("li", { hasText: "Water 75cl" }).getByText("40", { exact: true }).waitFor();
  await a.getByRole("link", { name: /STK-\d{8}-0001/ }).waitFor();
  await a.screenshot({ path: `${SHOTS}/13-stock.png`, fullPage: true });
  ok("receiving stock updates the stock on hand and clears the low-stock warning");

  // Dashboard reflects it
  await nav(a, "Dashboard");
  await a.getByText("Record the stock you have").waitFor();
  await a.screenshot({ path: `${SHOTS}/14-dashboard.png`, fullPage: true });
  ok("dashboard shows the new counts and checklist");

  // Staff member: can view and receive, cannot manage products
  await nav(a, "Team");
  await a.getByLabel("Email address").fill(chidi);
  await a.getByRole("button", { name: "Create invite" }).click();
  const link = await a.getByLabel("Invitation link").inputValue();
  const c = await newPage({ width: 390, height: 844 });
  await c.goto(link);
  await c.getByRole("link", { name: "Create an account to join" }).click();
  await signUp(c, "Chidi Eze", chidi, /\/invite\//);
  await c.getByRole("button", { name: "Accept invitation" }).click();
  await c.waitForURL(new RegExp(base + "$"));
  await c.goto(BASE + base + "/products");
  await c.locator("li", { hasText: "Cola 50cl" }).waitFor();
  assert.equal(await c.getByRole("link", { name: "+ New product" }).count(), 0);
  assert.equal(await c.getByRole("link", { name: "Edit" }).count(), 0);
  await c.goto(BASE + base + "/products/new");
  await c.waitForURL(new RegExp(base + "$"));
  ok("staff can see products but cannot add or edit them");

  await c.goto(BASE + base + "/stock");
  await c.getByRole("link", { name: "+ Receive stock" }).click();
  await pick(c, "Product", "Cola 50cl (crate)");
  await c.getByLabel("Quantity").fill("12.5");
  await c.getByRole("button", { name: "Save and add to stock" }).click();
  await c.waitForURL(/\/stock\/receipts\//);
  await c.getByRole("heading", { name: /^STK-\d{8}-0002$/ }).waitFor();
  await c.getByText("Chidi Eze").waitFor();
  await c.getByRole("link", { name: "Back to stock" }).click();
  await c.locator("li", { hasText: "Cola 50cl" }).getByText("112.5", { exact: true }).waitFor();
  await c.screenshot({ path: `${SHOTS}/15-stock-mobile.png`, fullPage: true });
  ok("staff receives stock on a phone; receipt is numbered and credited to them");

  await c.goto(BASE + base + "/customers");
  await c.getByRole("link", { name: "+ New customer" }).click();
  await c.getByLabel("Customer name").fill("Grace Canteen");
  await c.getByRole("button", { name: "Save customer" }).click();
  await c.waitForURL(new RegExp(base + "/customers$"));
  await c.locator("li", { hasText: "Grace Canteen" }).waitFor();
  ok("staff can add a customer");

  // Switch a product off: disappears from receive list
  await nav(a, "Products");
  await a.locator("li", { hasText: "Water 75cl" }).getByRole("button", { name: "Switch off" }).click();
  await a.locator("li", { hasText: "Water 75cl" }).getByText("Switched off").waitFor();
  await a.goto(BASE + base + "/stock/receive");
  const receiveBox = a.getByRole("combobox", { name: "Product", exact: true }).filter({ visible: true });
  await receiveBox.click();
  await receiveBox.fill("Water");
  await a.getByText(/Nothing matches/).waitFor();
  ok("a switched-off product can no longer be received");

  await browser.close();
  const real = errors.filter((e) => !/404|Failed to load resource/.test(e));
  console.log("browser errors:", real.length ? real : "none");
  console.log(`${passed} steps passed`);
  if (real.length) process.exit(1);
})().catch((e) => { console.error("FAIL", e.message.split("\n").slice(0, 14).join("\n")); process.exit(1); });
