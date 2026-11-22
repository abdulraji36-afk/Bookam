const { chromium } = require("playwright");
const { pick, addCrew, newOrders, receiveCards } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.argv[2] ?? require("node:os").tmpdir();
const run = Date.now().toString(36);
const ada = `ada4-${run}@example.com`, chidi = `chidi4-${run}@example.com`;
let passed = 0;
const ok = (name) => { passed++; console.log("PASS", name); };
const MAIL = `${process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324"}/api/v1`;
const vis = (locator) => locator.filter({ visible: true });

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
const menu = (page) => page.getByRole("navigation", { name: "Business" });

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
  // 1. A goods business: what comes back has its own name.
  await a.getByLabel("Business name").fill(`Ada Gas ${run}`);
  await a.getByText("Another kind of business").click();
  await a.getByLabel("What kind of business is it?").selectOption("Gas depot");
  await a.getByText("I count my goods").click();
  await a.getByLabel("Customers bring things back to me").check();
  await a.getByLabel("What do they bring back?").fill("Empty cylinders");
  await a.screenshot({ path: `${SHOTS}/30-goods-signup.png`, fullPage: true });
  await a.getByRole("button", { name: "Create business" }).click();
  await a.waitForURL(/\/b\/ada-gas-/);
  const base = new URL(a.url()).pathname;
  const go = (path) => a.goto(BASE + base + path);
  for (const name of ["Empty cylinders", "Return shortages", "Supplier returns", "Returns balance", "Records"]) {
    await menu(a).getByRole("link", { name, exact: true }).waitFor();
  }
  ok("a goods business signs up on the depot workspace, with its own name for what comes back");

  // 2. Products: Returnable (comes back) or Non-returnable, each with its unit, price and cost.
  await go("/products/new");
  await a.getByText("Does anything come back with it?").waitFor();
  await vis(a.getByLabel("Product name")).fill("Gas refill 12.5kg");
  await vis(a.getByLabel("Sold by the", { exact: true })).fill("cylinder");
  await vis(a.getByLabel(/Selling price/)).fill("15000");
  await vis(a.getByLabel(/Buying cost/)).fill("13000");
  await vis(a.getByLabel(/^Returnable/)).check();
  await vis(a.getByRole("button", { name: "Save product" })).click();
  await a.waitForURL(new RegExp(base + "/products$"));
  await go("/products/new");
  await vis(a.getByLabel("Product name")).fill("Regulator");
  await vis(a.getByLabel("Sold by the", { exact: true })).fill("piece");
  await vis(a.getByLabel(/Selling price/)).fill("6000");
  await vis(a.getByLabel(/Buying cost/)).fill("4500");
  await vis(a.getByLabel(/^Non-returnable/)).check();
  await vis(a.getByLabel("Category")).fill("Accessories");
  await vis(a.getByRole("button", { name: "Save product" })).click();
  await a.waitForURL(new RegExp(base + "/products$"));
  await a.locator("tr", { hasText: "Gas refill 12.5kg" }).getByText("Returnable", { exact: true }).waitFor();
  await a.locator("tr", { hasText: "Regulator" }).getByText("Accessories", { exact: true }).waitFor();
  ok("products are Returnable or Non-returnable, in their own units and categories");

  // 3. Opening count, stock in, customers, crew.
  await go("");
  await a.getByRole("link", { name: "Count your opening empty cylinders" }).click();
  await vis(a.getByLabel(/How many Empty cylinders\?/)).fill("50");
  await vis(a.getByRole("button", { name: "Save adjustment" })).click();
  await a.waitForURL(/\/returns\?saved=adjustment/);
  await go("/stock/receive");
  await receiveCards(a, [["Gas refill 12.5kg", 40], ["Regulator", 10]]);
  await vis(a.getByLabel("Supplier delivery reference")).fill("WB-1001");
  await vis(a.getByRole("button", { name: "Save and add to stock" })).click();
  await a.waitForURL(/\/stock\/receipts\/[0-9a-f-]{36}\?saved=1/);
  await go("/customers/new");
  await vis(a.getByLabel("Customer name")).fill("Chika Kitchen");
  await vis(a.getByRole("button", { name: "Save customer" })).click();
  await a.waitForURL(new RegExp(base + "/customers$"));
  await addCrew(a, BASE + base, ["Musa"]);
  ok("opening empty cylinders, stock in, a customer and a crew");

  // 4. Orders: Returnable and Non-returnable tabs, as RGB and PET are for drinks.
  const [gasOrder] = await newOrders(a, BASE + base, "rgb", [{ customer: "Chika Kitchen", lines: [["Gas refill 12.5kg", 10]] }]);
  await newOrders(a, BASE + base, "pet", [{ customer: "Chika Kitchen", lines: [["Regulator", 2]] }]);
  await go("/orders");
  const ordersSection = (name) => a.locator("section").filter({ has: a.getByRole("heading", { name, exact: true }) });
  await ordersSection("Returnable orders").locator("tr", { hasText: "Chika Kitchen" }).getByText("10", { exact: true }).first().waitFor();
  await ordersSection("Non-returnable orders").locator("tr", { hasText: "Chika Kitchen" }).waitFor();
  await go(`/dispatch/new?order=${gasOrder}`);
  for (const box of await vis(a.getByRole("checkbox", { name: /Chika Kitchen/ })).all()) await box.check();
  await vis(a.getByLabel("Driver", { exact: true })).selectOption({ label: "Musa" });
  await vis(a.getByLabel("Sule")).check();
  await vis(a.getByRole("button", { name: "Create trip" })).click();
  await a.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/);
  await a.getByText("To bring back: 10 Empty cylinders").waitFor();
  await vis(a.getByRole("button", { name: "Dispatch now" })).click();
  await a.getByRole("button", { name: /^Yes, / }).click();
  await vis(a.getByLabel("Returned by Chika Kitchen")).fill("8");
  await vis(a.getByRole("button", { name: "Record returns and complete trip" })).click();
  await vis(a.getByText("Completed", { exact: true })).first().waitFor();
  await a.locator("section", { hasText: "What came back" }).getByText("Short by 2").waitFor();
  ok("a trip takes the order out; 8 of 10 cylinders come back");

  // 5. The shortage, a follow-up, a supplier return and the balance.
  await go("/returns/shortages");
  await a.getByRole("heading", { name: "Return shortages" }).waitFor();
  const line = a.locator("tr", { hasText: "Chika Kitchen" });
  await line.getByText("Open", { exact: true }).waitFor();
  await line.getByRole("link").first().click();
  await a.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  await vis(a.getByLabel("How many empty cylinders did they bring?")).fill("2");
  await vis(a.getByRole("button", { name: "Record follow-up return" })).click();
  await vis(a.getByText("Follow-up return saved.")).first().waitFor();
  await go("/returns/exchange");
  await vis(a.getByLabel("Supplier delivery reference")).fill("REF-9");
  await vis(a.getByLabel(/Empty cylinders taken by the supplier/)).fill("30");
  await vis(a.getByRole("button", { name: /^Save/ })).click();
  await a.waitForURL((url) => !url.pathname.endsWith("/returns/exchange"));
  await go("/returns/adjustments");
  await a.getByRole("heading", { name: "Returns balance" }).waitFor();
  const card = (label) => a.locator("[data-summary-card]", { hasText: label });
  assert.match(await card("Opening empty cylinders").innerText(), /50$/);
  assert.match(await card("Trip returns").innerText(), /10$/);
  assert.match(await card("Supplier handoffs").innerText(), /30$/);
  assert.match(await card("Depot empty cylinders").innerText(), /30$/);
  ok("the shortage is followed up on the order, the supplier takes cylinders, and the balance adds up");

  // 6. No drinks words anywhere a goods business looks.
  const leftovers = [];
  const DRINKS = /\bRGB\b|\bPET\b|\bEmpties\b|\bempties\b|\bcrates?\b|\bdrinks?\b|\bNBC\b/;
  for (const path of [
    "", "/orders", "/orders/new", "/orders/new?kind=pet", "/orders/" + gasOrder, "/dispatch", "/stock", "/stock/summary",
    "/stock/receive", "/returns", "/returns/shortages", "/returns/exchanges", "/returns/exchange", "/returns/adjustments",
    "/returns/adjust", "/returns/customer-return", "/products", "/products/new", "/customers", "/reports/daily",
    "/reports/stock-value", "/records", "/records/rgb", "/records/pet", "/records/open-work", "/records/voided",
    "/activity", "/settings"
  ]) {
    await go(path);
    await a.waitForLoadState("networkidle");
    const text = await a.locator("body").innerText();
    for (const match of text.matchAll(new RegExp(DRINKS.source, "g"))) {
      leftovers.push(`${path || "/"}: "${match[0]}" in …${text.slice(Math.max(0, match.index - 50), match.index + 40).replace(/\s+/g, " ")}…`);
    }
  }
  assert.deepEqual(leftovers, [], "drinks words on goods screens:\n" + leftovers.join("\n"));
  ok("every screen speaks of goods: Returnable, Non-returnable and Empty cylinders, never RGB, PET or empties");

  await browser.close();
  const real = errors.filter((e) => !/404|Failed to load resource/.test(e));
  console.log("browser errors:", real.length ? real : "none");
  console.log(`${passed} steps passed`);
  if (real.length) process.exit(1);
})().catch(async (e) => {
  console.error("FAIL", e.message.split("\n").slice(0, 14).join("\n"));
  process.exit(1);
});
