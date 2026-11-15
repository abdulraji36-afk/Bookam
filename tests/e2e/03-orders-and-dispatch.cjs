const { chromium } = require("playwright");
const { pick } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.argv[2] ?? require("node:os").tmpdir();
const run = Date.now().toString(36);
const ada = `ada3-${run}@example.com`, chidi = `chidi3-${run}@example.com`;
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
  await a.getByLabel("I sell drinks (RGB crates and PET packs)").check();
  await a.getByRole("button", { name: "Create business" }).click();
  await a.waitForURL(/\/b\/ada-drinks-/);
  const base = new URL(a.url()).pathname;

  // --- set-up through the UI (covered in detail by the earlier walkthrough)
  async function addProduct(name, unit, price, returnItem) {
    await a.goto(BASE + base + "/products/new");
    await vis(a.getByLabel("Product name")).fill(name);
    await vis(a.getByLabel("Sold by the")).fill(unit);
    await vis(a.getByLabel(/Selling price/)).fill(price);
    await vis(a.getByLabel(/Buying cost/)).fill(String(Math.round(Number(price.replace(/,/g, "")) * 0.9)));
    if (returnItem) {
      await vis(a.getByLabel(/^RGB/)).check(); // the empty crate comes back
    }
    await vis(a.getByRole("button", { name: "Save product" })).click();
    await a.waitForURL(new RegExp(base + "/products$"));
  }
  async function addCustomer(name, area) {
    await a.goto(BASE + base + "/customers/new");
    await vis(a.getByLabel("Customer name")).fill(name);
    if (area) await vis(a.getByLabel("Area (optional)")).fill(area);
    await vis(a.getByRole("button", { name: "Save customer" })).click();
    await a.waitForURL(new RegExp(base + "/customers$"));
  }
  await addProduct("Cola 50cl", "crate", "4200", "Empties");
  await addProduct("Water 75cl", "pack", "1800");
  await addCustomer("Mama Tunde Stores", "Ikeja");
  await addCustomer("Grace Canteen");
  await a.goto(BASE + base + "/stock/receive");
  await pick(a, "Product", "Cola 50cl (crate)");
  await vis(a.getByLabel("Quantity")).fill("100");
  await vis(a.getByRole("button", { name: "Add another product" })).click();
  await pick(a, "Product 2", "Water 75cl (pack)");
  await vis(a.getByLabel("Quantity")).nth(1).fill("50");
  await vis(a.getByLabel("Supplier delivery reference")).fill("NBC-0001");
  await vis(a.getByLabel(/did the supplier take\?/)).fill("0");
  await vis(a.getByRole("button", { name: "Save and add to stock" })).click();
  await a.waitForURL(/\/stock\/receipts\//);
  ok("set-up: 2 drinks, 2 customers, stock received");

  // --- order with a return product and a no-return product
  async function fillOrder(page, customer, lines) {
    await pick(page, "Customer", customer);
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) await vis(page.getByRole("button", { name: "Add another product" })).click();
      const label = i === 0 ? "Product" : `Product ${i + 1}`;
      await pick(page, label, lines[i][0]);
      await vis(page.getByLabel("Quantity")).nth(i).fill(String(lines[i][1]));
    }
  }

  await nav(a, "Orders");
  await a.getByText("No orders yet").waitFor();
  await a.locator("main").getByRole("link", { name: "+ New order" }).click();
  await a.waitForURL(/\/orders\/new/);
  await fillOrder(a, "Mama Tunde Stores (Ikeja)", [["Cola 50cl", 40], ["Water 75cl", 10]]);
  await a.getByText("100 crate in stock").waitFor();
  await a.getByText("₦186,000").waitFor();
  await a.screenshot({ path: `${SHOTS}/20-new-order.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save order" })).click();
  await a.waitForURL(/\/orders\/[0-9a-f-]{36}\?saved=1/);
  await a.getByRole("heading", { name: /^ORD-\d{8}-0001$/ }).waitFor();
  await a.locator("tr", { hasText: "Cola 50cl" }).getByText("40 Empties", { exact: true }).waitFor();
  await a.getByText("Waiting for dispatch").first().waitFor();
  await a.screenshot({ path: `${SHOTS}/21-order.png`, fullPage: true });
  await a.goto(BASE + base + "/stock");
  await a.locator("li, tr", { hasText: "Cola 50cl" }).getByText("60", { exact: true }).waitFor();
  ok("an order sets its stock aside and shows what is due back");

  // --- cannot oversell; typed values survive the error
  await a.goto(BASE + base + "/orders/new");
  await fillOrder(a, "Grace Canteen", [["Water 75cl", 99]]);
  await a.getByText("40 pack in stock. That is more than you have.").waitFor();
  await vis(a.getByRole("button", { name: "Save order" })).click();
  await a.getByText("Not enough stock for Water 75cl. Available: 40, requested: 99.").waitFor();
  assert.equal(await vis(a.getByLabel("Quantity")).inputValue(), "99");
  await vis(a.getByLabel("Quantity")).fill("15");
  await vis(a.getByRole("button", { name: "Save order" })).click();
  await a.waitForURL(/\/orders\/[0-9a-f-]{36}\?saved=1/);
  await a.getByRole("heading", { name: /^ORD-\d{8}-0002$/ }).waitFor();
  ok("an order for more than is in stock is refused with a clear message");

  // --- edit while waiting
  await a.getByRole("link", { name: "Edit order" }).click();
  await a.waitForURL(/\/edit$/);
  await a.getByText("40 pack in stock").waitFor(); // 25 free + 15 this order holds
  await vis(a.getByLabel("Quantity")).fill("20");
  await vis(a.getByRole("button", { name: "Save changes" })).click();
  await a.waitForURL(/\/orders\/[0-9a-f-]{36}\?saved=1/);
  await a.locator("tr", { hasText: "Water 75cl" }).getByText("20 pack", { exact: true }).waitFor();
  await a.goto(BASE + base + "/stock");
  await a.locator("li, tr", { hasText: "Water 75cl" }).getByText("20", { exact: true }).waitFor();
  ok("editing a waiting order adjusts the stock it holds");

  // --- trip
  await nav(a, "Dispatch");
  await a.getByText("2 orders waiting to be put on a trip.").waitFor();
  await a.locator("main").getByRole("link", { name: "+ New trip" }).click();
  await a.waitForURL(/\/dispatch\/new/);
  await vis(a.getByLabel("Driver's name")).fill("Musa");
  await vis(a.getByLabel("Truck")).fill("LAG-123-XY");
  await vis(a.getByRole("button", { name: "Create trip" })).click();
  await a.getByText("Choose at least one order to put on the trip.").waitFor();
  await vis(a.getByRole("button", { name: "Choose all" })).click();
  await a.getByText("Orders to load (2 chosen)").waitFor();
  await a.screenshot({ path: `${SHOTS}/22-new-trip.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Create trip" })).click();
  await a.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/);
  await a.getByRole("heading", { name: /^TRP-\d{8}-0001$/ }).waitFor();
  const loading = a.locator("section", { hasText: "Loading list" });
  await loading.locator("li, tr", { hasText: "Cola 50cl" }).getByText(/^40\s/).waitFor();
  await loading.locator("li, tr", { hasText: "Water 75cl" }).getByText(/^30\s/).waitFor();
  await a.getByText("To bring back: 40 Empties").waitFor();
  await a.screenshot({ path: `${SHOTS}/23-trip-draft.png`, fullPage: true });
  ok("a trip groups orders and adds up a loading list");

  // an order on a trip can no longer be edited
  await a.locator("li, tr", { hasText: "Grace Canteen" }).getByRole("link").click();
  await a.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  await vis(a.getByText("On a trip", { exact: true })).waitFor();
  assert.equal(await vis(a.getByRole("link", { name: "Edit order" })).count(), 0);
  const graceOrder = a.url();
  await a.goto(graceOrder + "/edit");
  await a.waitForURL(graceOrder);
  await a.getByRole("link", { name: /^TRP-/ }).click();
  await a.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/);

  await vis(a.getByRole("button", { name: "Dispatch now" })).click();
  await a.getByRole("button", { name: /^Yes, / }).click();
  await vis(a.getByRole("heading", { name: "Record what came back" })).waitFor();
  await a.locator("li, tr", { hasText: "Grace Canteen" }).getByText("Completed").waitFor();
  await a.locator("li, tr", { hasText: "Mama Tunde Stores" }).getByText("Out · returns due").waitFor();
  assert.equal(await vis(a.getByRole("button", { name: "Dispatch now" })).count(), 0);
  await a.screenshot({ path: `${SHOTS}/24-trip-dispatched.png`, fullPage: true });
  ok("dispatching completes the no-return order and leaves the return order open");

  // --- cancel puts stock back
  await a.goto(BASE + base + "/orders/new");
  await fillOrder(a, "Grace Canteen", [["Water 75cl", 5]]);
  await vis(a.getByRole("button", { name: "Save order" })).click();
  await a.waitForURL(/\/orders\/[0-9a-f-]{36}\?saved=1/);
  await vis(a.getByRole("button", { name: "Cancel order" })).click();
  await a.getByRole("button", { name: /^Yes, / }).click();
  await a.getByText("Cancelled").first().waitFor();
  await a.goto(BASE + base + "/stock");
  await a.locator("li, tr", { hasText: "Water 75cl" }).getByText("20", { exact: true }).waitFor();
  ok("cancelling a waiting order puts its stock back");

  // --- staff on a phone: order -> trip -> dispatch
  await nav(a, "Team");
  await vis(a.getByLabel("Email address")).fill(chidi);
  await vis(a.getByRole("button", { name: "Create invite" })).click();
  const link = await vis(a.getByLabel("Invitation link")).inputValue();
  const c = await newPage({ width: 390, height: 844 });
  await c.goto(link);
  await c.getByRole("link", { name: "Create an account to join" }).click();
  await signUp(c, "Chidi Eze", chidi, /\/invite\//);
  await c.getByRole("button", { name: "Accept invitation" }).click();
  await c.waitForURL(new RegExp(base + "$"));
  await c.goto(BASE + base + "/orders/new");
  await fillOrder(c, "Grace Canteen", [["Water 75cl", 4]]);
  await c.screenshot({ path: `${SHOTS}/25-new-order-mobile.png`, fullPage: true });
  await vis(c.getByRole("button", { name: "Save order" })).click();
  await c.waitForURL(/\/orders\/[0-9a-f-]{36}\?saved=1/);
  await c.goto(BASE + base + "/dispatch/new");
  await vis(c.getByLabel("Driver's name")).fill("Tunde");
  await vis(c.getByLabel("Truck")).fill("LAG-100-AA");
  await vis(c.getByRole("checkbox")).check();
  await vis(c.getByRole("button", { name: "Create trip" })).click();
  await c.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/);
  assert.equal(await vis(c.getByRole("button", { name: "Cancel trip" })).count(), 0, "staff cannot cancel a trip");
  await vis(c.getByRole("button", { name: "Dispatch now" })).click();
  await c.getByRole("button", { name: /^Yes, / }).click();
  await c.getByText("Completed").first().waitFor();
  await c.screenshot({ path: `${SHOTS}/26-trip-mobile.png`, fullPage: true });
  ok("staff records an order, builds a trip and dispatches it from a phone");

  // --- owner can cancel a draft trip
  await a.goto(BASE + base + "/orders/new");
  await fillOrder(a, "Mama Tunde Stores (Ikeja)", [["Cola 50cl", 5]]);
  await vis(a.getByRole("button", { name: "Save order" })).click();
  await a.waitForURL(/\/orders\/[0-9a-f-]{36}\?saved=1/);
  await a.goto(BASE + base + "/dispatch/new");
  await vis(a.getByLabel("Driver's name")).fill("Musa");
  await vis(a.getByLabel("Truck")).fill("LAG-100-AA");
  await vis(a.getByRole("checkbox")).check();
  await vis(a.getByRole("button", { name: "Create trip" })).click();
  await a.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/);
  await vis(a.getByRole("button", { name: "Cancel trip" })).click();
  await a.getByRole("button", { name: /^Yes, / }).click();
  await a.getByText("The orders were sent back to the waiting list").waitFor();
  await a.goto(BASE + base + "/orders?status=waiting");
  await a.locator("tr", { hasText: "Mama Tunde Stores" }).first().waitFor();
  await a.screenshot({ path: `${SHOTS}/27-orders.png`, fullPage: true });
  ok("an owner cancels a trip that has not left and its order waits again");

  await nav(a, "Dashboard");
  const tile = a.getByRole("link", { name: /Waiting for dispatch/ });
  await tile.getByText("1", { exact: true }).waitFor();
  await a.screenshot({ path: `${SHOTS}/28-dashboard.png`, fullPage: true });
  ok("dashboard shows what is waiting");

  await browser.close();
  const real = errors.filter((e) => !/404|Failed to load resource/.test(e));
  console.log("browser errors:", real.length ? real : "none");
  console.log(`${passed} steps passed`);
  if (real.length) process.exit(1);
})().catch((e) => { console.error("FAIL", e.message.split("\n").slice(0, 14).join("\n")); process.exit(1); });
