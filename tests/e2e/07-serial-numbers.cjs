const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { pick } = require("./helpers.cjs");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.argv[2] ?? require("node:os").tmpdir();
const run = Date.now().toString(36);
const owner = `gadget-${run}@example.com`, staffEmail = `gstaff-${run}@example.com`;
let passed = 0;
const ok = (name) => { passed++; console.log("PASS", name); };
const MAIL = `${process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324"}/api/v1`;
const vis = (l) => l.filter({ visible: true });

async function confirmationLink(email) {
  for (let i = 0; i < 20; i++) {
    const found = await (await fetch(`${MAIL}/search?query=${encodeURIComponent("to:" + email)}`)).json();
    if (found.messages?.length) {
      const m = await (await fetch(`${MAIL}/message/${found.messages[0].ID}`)).json();
      return (m.HTML || m.Text).match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no email for " + email);
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
  await signUp(a, "Femi Ade", owner, "**/onboarding");
  await a.getByLabel("Business name").fill(`Femi Gadgets ${run}`);
  await a.getByText("I sell items with serial numbers").click();
  // A phone shop is asked about delivery, which starts unticked; not about returns.
  assert.equal(await a.getByLabel("We deliver to customers").isChecked(), false);
  assert.equal(await a.getByLabel("Customers bring things back to me").count(), 0);
  await a.getByRole("button", { name: "Create business" }).click();
  await a.waitForURL(/\/b\/femi-gadgets-/);
  const base = new URL(a.url()).pathname;
  const go = (p) => a.goto(BASE + base + p);
  const menu = a.getByRole("navigation", { name: "Business" });

  // A phone shop's own words and menu: Sales, no Dispatch, serial search up front.
  await menu.getByRole("link", { name: "Sales", exact: true }).waitFor();
  assert.equal(await menu.getByRole("link", { name: "Orders", exact: true }).count(), 0);
  assert.equal(await menu.getByRole("link", { name: "Dispatch", exact: true }).count(), 0);
  await a.locator("main").getByRole("link", { name: "+ New sale" }).waitFor();
  await a.getByLabel("Find a serial number").waitFor();
  await a.getByText("Waiting to be collected").first().waitFor();
  ok("a phone shop sees Sales instead of Orders, no Dispatch, and the serial search on its dashboard");

  // Products: a serial-tracked phone with warranty, and a plain charger
  await go("/products/new");
  await vis(a.getByLabel("Product name")).fill("iPhone 15 128GB");
  await vis(a.getByLabel("Sold by the", { exact: true })).fill("phone");
  await vis(a.getByLabel(/Selling price/)).fill("1150000");
  // In a phone shop a new product starts as serial-numbered.
  assert.equal(await vis(a.getByLabel("Track each unit by serial number")).isChecked(), true);
  await vis(a.getByLabel("Warranty in months (optional)")).fill("12");
  await a.screenshot({ path: `${SHOTS}/70-product-serial.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save product" })).click();
  await a.waitForURL(new RegExp(base + "/products$"));
  await a.locator("tr", { hasText: "iPhone 15 128GB" }).getByText("Serial numbers", { exact: true }).waitFor();
  await go("/products/new");
  await vis(a.getByLabel("Product name")).fill("USB-C charger");
  await vis(a.getByLabel("Sold by the", { exact: true })).fill("piece");
  await vis(a.getByLabel(/Selling price/)).fill("8000");
  await vis(a.getByLabel("Track each unit by serial number")).uncheck(); // accessories are counted
  await vis(a.getByRole("button", { name: "Save product" })).click();
  await a.waitForURL(new RegExp(base + "/products$"));
  await a.locator("tr", { hasText: "USB-C charger" }).getByText("Counted", { exact: true }).waitFor();
  ok("a product can be set to track each unit by serial number, with a warranty");

  // Stock in phone by phone; Enter (as a scanner sends) starts the next line
  await go("/stock/receive");
  await pick(a, "Product", "iPhone 15 128GB");
  await vis(a.getByLabel("Serial / IMEI 1")).fill("356 789 101 234 561");
  await vis(a.getByLabel("Colour")).first().fill("Black");
  await vis(a.getByLabel("Serial / IMEI 1")).press("Enter");
  const serial2 = vis(a.getByLabel("Serial / IMEI 2"));
  await serial2.waitFor();
  assert.equal(await serial2.evaluate((el) => el === document.activeElement), true, "the next serial box takes the cursor");
  assert.equal(await vis(a.getByLabel("Colour")).nth(1).inputValue(), "Black", "colour carries over");
  await serial2.fill("356789101234562");
  await serial2.press("Enter");
  await vis(a.getByLabel("Serial / IMEI 3")).fill("356789101234563");
  await vis(a.getByLabel("Colour")).nth(2).fill("Blue");
  await vis(a.getByLabel("Serial / IMEI 3")).press("Enter"); // leaves an empty 4th line, which is ignored
  await vis(a.getByRole("button", { name: "Add another product" })).click();
  await pick(a, "Product 2", "USB-C charger");
  await vis(a.getByLabel("Quantity")).fill("20");
  await a.screenshot({ path: `${SHOTS}/71-receive-serials.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save and add to stock" })).click();
  await a.waitForURL(/\/stock\/receipts\//);
  await a.getByText("356789101234561 · Black").waitFor();
  await a.getByText("356789101234562 · Black").waitFor();
  await a.getByText("356789101234563 · Blue").waitFor();
  assert.equal(await a.getByText(/Brand new|UK used|Nigerian used/).count(), 0, "no condition anywhere");
  ok("phones are stocked in one by one with serial and colour; a scanner's Enter starts the next line");

  // Duplicate refused
  await go("/stock/receive");
  await pick(a, "Product", "iPhone 15 128GB");
  await vis(a.getByLabel("Serial / IMEI 1")).fill("356789101234561");
  await vis(a.getByRole("button", { name: "Save and add to stock" })).click();
  await a.getByText("Serial number 356789101234561 is already in your stock or on an order.").waitFor();
  ok("a serial number already in stock is refused");

  // Stock page breakdown
  await go("/stock/summary");
  const phoneRow = a.locator("li, tr", { hasText: "iPhone 15 128GB" });
  await phoneRow.getByText("3", { exact: true }).waitFor();
  await phoneRow.getByText("Black ×2 · Blue ×1").waitFor();
  await a.screenshot({ path: `${SHOTS}/72-stock-breakdown.png`, fullPage: true });
  ok("stock shows the count and the colours of what is in");

  // Counter sale to a walk-in buyer, choosing the exact phone
  await go("/orders/new");
  await vis(a.getByLabel("Walk-in buyer")).check();
  await vis(a.getByLabel("Buyer's name (optional)")).fill("Tunde Bello");
  await vis(a.getByLabel("Buyer's phone (optional)")).fill("0812 345 6789");
  await pick(a, "Product", "iPhone 15 128GB");
  await a.getByText("2. Serial number of each phone going out (0 chosen)").waitFor();
  // Colour first: picking Blue leaves only the blue phone.
  await vis(a.getByRole("button", { name: "Blue (1)" })).click();
  assert.equal(await a.locator("label", { hasText: "356789101234561" }).count(), 0, "black phones hidden");
  await a.locator("label", { hasText: "356789101234563" }).click();
  await a.getByText("2. Serial number of each phone going out (1 chosen)").waitFor();
  await a.getByText("₦1,150,000").first().waitFor();
  assert.equal(await vis(a.getByLabel("Customer takes it now")).isChecked(), true, "walk-in defaults to taking it now");
  await a.screenshot({ path: `${SHOTS}/73-counter-sale.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save and complete sale" })).click();
  await a.waitForURL(/\/orders\/[0-9a-f-]{36}\?saved=1/);
  await vis(a.getByText("Completed", { exact: true })).first().waitFor();
  await a.getByText("Tunde Bello (walk-in)").waitFor();
  await a.getByText(/At the counter,/).waitFor();
  await a.getByText("356789101234563 · Blue").waitFor();
  ok("a walk-in buyer takes a chosen phone at the counter and the order completes at once");

  // Serial lookup
  await go("/stock/summary");
  await a.getByLabel("Find a serial number").fill("4563");
  await a.getByRole("button", { name: "Find" }).click();
  await a.waitForURL(/\/stock\/serials\?q=4563/);
  const card = a.locator("section", { hasText: "356789101234563" });
  await card.getByText("Sold", { exact: true }).waitFor();
  await card.getByText("Tunde Bello").waitFor();
  await card.getByText(/Under warranty until/).waitFor();
  await card.getByText(/0812 345 6789/).waitFor();
  await a.screenshot({ path: `${SHOTS}/74-serial-lookup.png`, fullPage: true });
  ok("looking up a serial shows who bought it, when, and that it is under warranty");

  // Saved-customer order on a phone, held then handed over
  await go("/customers/new");
  await vis(a.getByLabel("Customer name")).fill("Ade Phones Ltd");
  await vis(a.getByRole("button", { name: "Save customer" })).click();
  await a.waitForURL(new RegExp(base + "/customers$"));
  await go("/team");
  await vis(a.getByLabel("Email address")).fill(staffEmail);
  await vis(a.getByRole("button", { name: "Create invite" })).click();
  const link = await vis(a.getByLabel("Invitation link")).inputValue();
  const c = await newPage({ width: 390, height: 844 });
  await c.goto(link);
  await c.getByRole("link", { name: "Create an account to join" }).click();
  await signUp(c, "Kemi Staff", staffEmail, /\/invite\//);
  await c.getByRole("button", { name: "Accept invitation" }).click();
  await c.waitForURL(new RegExp(base + "$"));
  await c.goto(BASE + base + "/orders/new");
  await pick(c, "Customer", "Ade Phones Ltd");
  await pick(c, "Product", "iPhone 15 128GB");
  await c.locator("label", { hasText: "356789101234562" }).click();
  await vis(c.getByRole("button", { name: "Add another product" })).click();
  await pick(c, "Product 2", "USB-C charger");
  await vis(c.getByLabel("Quantity")).last().fill("2");
  await c.screenshot({ path: `${SHOTS}/75-order-units-mobile.png`, fullPage: true });
  // A phone shop sells over the counter by default; this one is collected later.
  assert.equal(await vis(c.getByLabel("Customer takes it now")).isChecked(), true);
  await vis(c.getByLabel("Customer collects it later")).check();
  await vis(c.getByRole("button", { name: "Save sale" })).click();
  await c.waitForURL(/\/orders\/[0-9a-f-]{36}\?saved=1/);
  await vis(c.getByText("Waiting to be collected", { exact: true })).first().waitFor();
  // The held phone can no longer be chosen elsewhere
  await go("/orders/new");
  await pick(a, "Customer", "Ade Phones Ltd");
  await pick(a, "Product", "iPhone 15 128GB");
  await a.getByText("Serial number of each phone going out (0 chosen)").waitFor();
  assert.equal(await a.locator("label", { hasText: "356789101234562" }).count(), 0, "a held phone is not offered");
  await a.locator("label", { hasText: "356789101234561" }).waitFor();
  // Staff hands the held order over
  await vis(c.getByRole("button", { name: "Handed over now" })).click();
  await c.getByRole("button", { name: /^Yes, / }).click();
  await vis(c.getByText("Completed", { exact: true })).first().waitFor();
  await c.getByText(/At the counter,/).waitFor();
  ok("staff records a phone order for a saved customer, the phone is held, then handed over at the counter");

  // Void puts the phone back
  await go("/stock/serials?q=4562");
  await a.locator("section", { hasText: "356789101234562" }).getByText("Sold", { exact: true }).waitFor();
  await a.locator("section", { hasText: "356789101234562" }).getByRole("link", { name: /^ORD-/ }).click();
  await a.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  await vis(a.getByText("Void this sale", { exact: true })).click();
  await vis(a.getByLabel("Reason")).fill("Customer returned it the same day");
  await vis(a.getByRole("button", { name: "Void sale" })).click();
  await a.getByText("This sale was voided.").waitFor();
  await go("/stock/serials?q=4562");
  await a.locator("section", { hasText: "356789101234562" }).getByText("In stock", { exact: true }).waitFor();
  ok("voiding the sale puts the exact phone back in stock");

  // A phone shop that starts delivering switches it on in Settings.
  await go("/settings");
  const selling = a.locator("form", { has: a.getByText("How do you sell?") });
  assert.equal(await selling.getByLabel(/I sell items with serial numbers/).isChecked(), true);
  await selling.getByLabel("We deliver to customers").check();
  await selling.getByRole("button", { name: "Save" }).click();
  await selling.getByText("Saved. The menus and forms now match what you sell.").waitFor();
  await menu.getByRole("link", { name: "Dispatch", exact: true }).waitFor();
  await go("/orders/new");
  await vis(a.getByLabel("Deliver on a trip")).waitFor();
  await a.screenshot({ path: `${SHOTS}/76-phone-shop-delivers.png`, fullPage: true });
  ok("switching delivery on in Settings brings Dispatch and the delivery option back");

  await browser.close();
  const real = errors.filter((e) => !/404|Failed to load resource/.test(e));
  console.log("browser errors:", real.length ? real : "none");
  console.log(`${passed} steps passed`);
  if (real.length) process.exit(1);
})().catch(async (e) => { try { await dbg.screenshot({ path: SHOTS + "/fail.png", fullPage: true }); console.error("URL", dbg.url()); } catch {} console.error("FAIL", e.message.split("\n").slice(0, 12).join("\n")); process.exit(1); });
