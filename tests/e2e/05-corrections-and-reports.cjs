const { chromium } = require("playwright");
const { pick, addCrew } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.argv[2] ?? require("node:os").tmpdir();
const run = Date.now().toString(36);
const ada = `ada5-${run}@example.com`, chidi = `chidi5-${run}@example.com`;
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

let dbg;
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
  dbg = a;
  await a.goto(BASE + "/signup");
  await signUp(a, "Ada Obi", ada, "**/onboarding");
  await a.getByLabel("Business name").fill(`Ada Drinks ${run}`);
  await a.getByText("I count my goods").click();
  await a.getByLabel("I sell drinks (RGB crates and PET packs)").check();
  await a.getByRole("button", { name: "Create business" }).click();
  await a.waitForURL(/\/b\/ada-drinks-/);
  const base = new URL(a.url()).pathname;
  const go = (path) => a.goto(BASE + base + path);

  async function addProduct(name, unit, price, returnItem) {
    await go("/products/new");
    await vis(a.getByLabel("Product name")).fill(name);
    // Drinks are sold by the crate (RGB) or the pack (PET), so the unit is only asked otherwise.
    const soldBy = vis(a.getByLabel("Sold by the", { exact: true }));
    if (await soldBy.count()) await soldBy.fill(unit);
    await vis(a.getByLabel(/Selling price/)).fill(price);
    await vis(a.getByLabel(/Buying cost/)).fill(String(Math.round(Number(price) * 0.9)));
    if (returnItem) {
      await vis(a.getByLabel(/^RGB/)).check(); // the empty crate comes back
    } else if (await vis(a.getByLabel(/^PET, can or carton/)).count()) {
      await vis(a.getByLabel(/^PET, can or carton/)).check();
      await vis(a.getByLabel("Category")).selectOption("PET");
    }
    await vis(a.getByRole("button", { name: "Save product" })).click();
    await a.waitForURL(new RegExp(base + "/products$"));
  }
  async function addCustomer(name) {
    await go("/customers/new");
    await vis(a.getByLabel("Customer name")).fill(name);
    await vis(a.getByRole("button", { name: "Save customer" })).click();
    await a.waitForURL(new RegExp(base + "/customers$"));
  }
  async function receive(product, quantity) {
    await go("/stock/receive");
    await pick(a, "Product", product);
    await vis(a.getByLabel("Quantity")).fill(String(quantity));
    await vis(a.getByLabel("Supplier delivery reference")).fill(`NBC-${Date.now()}`);
    await vis(a.getByRole("button", { name: "Save and add to stock" })).click();
    await a.waitForURL(/\/stock\/receipts\/[0-9a-f-]{36}/);
    return a.url().split("?")[0];
  }
  async function order(customer, product, quantity) {
    await go("/orders/new?single=1");
    await pick(a, "Customer", customer);
    await pick(a, "Product", product);
    await vis(a.getByLabel("Quantity")).fill(String(quantity));
    await vis(a.getByRole("button", { name: "Save order" })).click();
    await a.waitForURL(/\/orders\/[0-9a-f-]{36}\?saved=1/);
    return a.url().split("?")[0];
  }
  async function tripWithAll(driver) {
    await go("/dispatch/new");
    await vis(a.getByLabel("Driver", { exact: true })).selectOption({ label: driver });
    await vis(a.getByLabel("Sule")).check();
    const boxes = vis(a.getByRole("checkbox"));
    for (let i = 0; i < (await boxes.count()); i++) await boxes.nth(i).check();
    await vis(a.getByRole("button", { name: "Create trip" })).click();
    await a.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/);
    await vis(a.getByRole("button", { name: "Dispatch now" })).click();
    await a.getByRole("button", { name: /^Yes, / }).click();
    return a.url();
  }
  async function withReason(scope, trigger, button, reason, quantity) {
    await vis(scope.getByText(trigger, { exact: true })).click();
    if (quantity !== undefined) await vis(scope.getByLabel(/^Returned by/)).last().fill(String(quantity));
    await vis(scope.getByLabel("Reason")).fill(reason);
    await vis(scope.getByRole("button", { name: button })).click();
  }
  const stockOf = async (name, value) => {
    await go("/stock");
    await a.locator("li, tr", { hasText: name }).getByText(String(value), { exact: true }).waitFor();
  };
  const crateTotals = async (inStore, owed) => {
    await go("/returns");
    const card = a.locator("section", { hasText: "Empties" }).filter({ hasText: "In store" });
    await card.locator("div", { hasText: "In store" }).getByText(String(inStore), { exact: true }).waitFor();
    await card.locator("div", { hasText: "Owed by customers" }).getByText(String(owed), { exact: true }).waitFor();
  };

  await addProduct("Cola 50cl", "crate", "4200", "Empties");
  await addProduct("Water 75cl", "pack", "1800");
  await addCustomer("Mama Tunde Stores");
  await addCustomer("Alhaji Musa Kiosk");
  await receive("Cola 50cl (crate)", 200);
  const waterReceipt = await receive("Water 75cl (pack)", 50);
  await go("/returns/adjust");
  await vis(a.getByLabel(/How many Empties\?/)).fill("100");
  await vis(a.getByLabel("Reason")).selectOption({ label: "Opening empties (already in store)" });
  await vis(a.getByRole("button", { name: "Save adjustment" })).click();
  await a.waitForURL(/\/returns\?saved=adjustment/);

  // A full cycle: two orders out, returns recorded with one short
  const mamaOrder = await order("Mama Tunde Stores", "Cola 50cl", 40);
  await order("Alhaji Musa Kiosk", "Cola 50cl", 20);
  await addCrew(a, BASE + base, ["Musa Driver"]);
  const tripUrl = await tripWithAll("Musa Driver");
  await vis(a.getByLabel("Returned by Mama Tunde Stores")).fill("30");
  await vis(a.getByLabel("Returned by Alhaji Musa Kiosk")).fill("20");
  await vis(a.getByRole("button", { name: "Record returns and complete trip" })).click();
  await vis(a.getByRole("heading", { name: "What came back", exact: true })).waitFor();
  await a.locator("section", { hasText: "What came back" }).locator("li, tr", { hasText: "Alhaji Musa Kiosk" }).getByText("All back").waitFor();
  await crateTotals(150, 10);
  ok("set-up: a trip went out and came back 10 crates short");

  // Correct the returned figure
  await a.goto(tripUrl);
  // Corrections are in the trip's Actions box.
  const actions = a.locator("section", { has: a.getByRole("heading", { name: "Actions", exact: true }) });
  await withReason(actions, "Correct what Mama Tunde Stores returned", "Save correction", "ok", 36);
  await a.getByText("Give a reason of at least 10 characters.").waitFor();
  await vis(actions.getByLabel("Reason")).fill("Six more crates were found in the truck");
  await vis(actions.getByRole("button", { name: "Save correction" })).click();
  await actions.getByText("Figure corrected.").waitFor();
  const mamaLine = a.locator("section", { hasText: "What came back" }).locator("tr", { hasText: "Mama Tunde Stores" });
  await mamaLine.getByText("Short by 4").waitFor();
  await a.screenshot({ path: `${SHOTS}/40-correct-return.png`, fullPage: true });
  await crateTotals(156, 4);
  ok("an owner corrects a returned figure, with a reason, and the balances follow");

  // Void the completed order
  await a.goto(mamaOrder);
  await withReason(a.locator("main"), "Void this order", "Void order", "Recorded for the wrong customer");
  await a.getByText("This order was voided.").waitFor();
  await vis(a.getByText("Voided", { exact: true })).first().waitFor();
  assert.equal(await vis(a.getByText("Void this order", { exact: true })).count(), 0);
  await a.screenshot({ path: `${SHOTS}/41-voided-order.png`, fullPage: true });
  await stockOf("Cola 50cl", 180); // only Musa's 20 are out
  await crateTotals(120, 0); // Musa returned 20: 100 opening + 20
  await a.goto(tripUrl);
  await a.locator("section", { hasText: "1 order" }).locator("li, tr", { hasText: "Mama Tunde Stores" }).getByText("Voided").waitFor();
  ok("voiding a completed order puts stock back and reverses its returns");

  // Void a receipt: blocked while its stock is sold, allowed after
  const waterOrder = await order("Mama Tunde Stores", "Water 75cl", 5);
  await a.goto(waterReceipt);
  await withReason(a.locator("main"), "Void this delivery", "Void delivery", "Delivery was entered twice");
  await a.getByText("This receipt cannot be voided: only 45 of Water 75cl is left in stock, and it brought in 50.").waitFor();
  await a.goto(waterOrder);
  // A waiting order offers Cancel, not Void.
  assert.equal(await vis(a.getByText("Void this order", { exact: true })).count(), 0);
  await vis(a.getByRole("button", { name: "Cancel order" })).click();
  await a.getByRole("button", { name: /^Yes, / }).click();
  await vis(a.getByText("Cancelled", { exact: true })).first().waitFor();
  await a.goto(waterReceipt);
  await withReason(a.locator("main"), "Void this delivery", "Void delivery", "Delivery was entered twice");
  await a.getByText("This receipt was voided and its stock taken back out.").waitFor();
  await stockOf("Water 75cl", 0);
  await go("/stock/receipts?status=voided");
  await a.locator("tr").getByText("Voided", { exact: true }).first().waitFor();
  ok("a stock receipt cannot be voided while its stock is sold, and can once it is back");

  // Void an adjustment from the returns page
  await go("/returns/adjust");
  await vis(a.getByLabel(/How many Empties\?/)).fill("7");
  await vis(a.getByLabel("Reason")).selectOption({ label: "Bought new ones" });
  await vis(a.getByRole("button", { name: "Save adjustment" })).click();
  await a.waitForURL(/\/returns\?saved=adjustment/);
  await crateTotals(127, 0);
  // A movement opens on its own page, where it can be voided.
  await a.locator("section", { hasText: "Latest movements" }).locator("tr", { hasText: "Bought new ones" }).getByRole("link").click();
  await a.waitForURL(/\/returns\/adjustments\/[0-9a-f-]{36}$/);
  await withReason(a.locator("main"), "Void this adjustment", "Void adjustment", "Entered seven instead of seventy");
  await a.getByText("This adjustment was voided", { exact: false }).first().waitFor();
  await crateTotals(120, 0);
  ok("an adjustment is voided from the returns page and the count goes back");

  // Activity log
  await go("/activity");
  const log = a.locator("section", { hasText: "Latest activity" });
  await log.locator("li, tr", { hasText: "Voided an order" }).first().getByText(/Recorded for the wrong customer|Customer changed their mind/).waitFor();
  await log.locator("li, tr", { hasText: "Corrected a returned figure" }).getByText(/Six more crates were found/).waitFor();
  await log.locator("li, tr", { hasText: "Voided a stock receipt" }).getByText("Ada Obi").waitFor();
  await log.locator("li, tr", { hasText: "Received stock" }).first().waitFor();
  await a.screenshot({ path: `${SHOTS}/42-activity.png`, fullPage: true });
  ok("the activity page lists who did what, with the reasons");

  // Daily report
  await go("/reports/daily");
  await a.getByText("Today so far.").waitFor();
  const stockTable = a.locator("section", { hasText: "Stock" }).first();
  const colaRow = stockTable.locator("tr", { hasText: "Cola 50cl" });
  assert.deepEqual((await colaRow.locator("td").allInnerTexts()).map((t) => t.trim()), ["0", "200", "20", "180"]);
  const crateRow = a.locator("section", { hasText: "Empties count" }).locator("tr", { hasText: "Empties" });
  assert.deepEqual((await crateRow.locator("td").allInnerTexts()).map((t) => t.trim()), ["0", "156", "36", "120", "0"]);
  await a.getByText("₦84,000").first().waitFor(); // only Musa's order counts
  await a.locator("section", { hasText: "Orders recorded (3)" }).getByText("Voided").first().waitFor();
  await a.screenshot({ path: `${SHOTS}/43-daily-report.png`, fullPage: true });
  await a.getByRole("link", { name: "Previous day" }).click();
  await a.getByText("What happened on this day.").waitFor();
  await a.getByText("No orders were recorded on this day.").waitFor();
  ok("the daily report adds up and leaves voided orders out of the totals");

  // Staff: no void controls, no activity page, report without money
  await go("/team");
  await vis(a.getByLabel("Email address")).fill(chidi);
  await vis(a.getByRole("button", { name: "Create invite" })).click();
  const link = await vis(a.getByLabel("Invitation link")).inputValue();
  const c = await newPage({ width: 390, height: 844 });
  await c.goto(link);
  await c.getByRole("link", { name: "Create an account to join" }).click();
  await signUp(c, "Chidi Eze", chidi, /\/invite\//);
  await c.getByRole("button", { name: "Accept invitation" }).click();
  await c.waitForURL(new RegExp(base + "$"));
  await c.goto(tripUrl);
  await c.locator("section", { hasText: "What came back" }).waitFor();
  assert.equal(await c.getByText(/^Correct what/).count(), 0);
  await c.goto(BASE + base + "/returns");
  await c.locator("section", { hasText: "Latest movements" }).waitFor();
  assert.equal(await c.getByText(/^Void this/).count(), 0);
  await c.goto(BASE + base + "/activity");
  await c.waitForURL(new RegExp(base + "$"));
  await c.goto(BASE + base + "/reports/daily");
  await c.getByText("Today so far.").waitFor();
  assert.equal(await c.getByText(/₦/).count(), 0, "staff see no money on the report");
  await c.getByText("Trips sent out").first().waitFor();
  await c.screenshot({ path: `${SHOTS}/44-daily-report-mobile.png`, fullPage: true });
  ok("staff cannot void, correct or open Activity, and their report shows no money");

  await browser.close();
  const real = errors.filter((e) => !/404|Failed to load resource/.test(e));
  console.log("browser errors:", real.length ? real : "none");
  console.log(`${passed} steps passed`);
  if (real.length) process.exit(1);
})().catch(async (e) => { try { await dbg.screenshot({ path: SHOTS + "/fail.png", fullPage: true }); console.error("URL", dbg.url()); } catch {} console.error("FAIL", e.message.split("\n").slice(0, 14).join("\n")); process.exit(1); });
