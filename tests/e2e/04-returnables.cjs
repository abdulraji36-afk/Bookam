const { chromium } = require("playwright");
const { pick, addCrew } = require("./helpers.cjs");
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
  await a.getByLabel("Business name").fill(`Ada Drinks ${run}`);
  await a.getByText("I count my goods").click();
  await a.getByRole("button", { name: "Create business" }).click();
  await a.waitForURL(/\/b\/ada-drinks-/);
  const base = new URL(a.url()).pathname;
  const go = (path) => a.goto(BASE + base + path);

  async function addProduct(name, unit, price, returnItem) {
    await go("/products/new");
    await vis(a.getByLabel("Product name")).fill(name);
    await vis(a.getByLabel("Sold by the")).fill(unit);
    await vis(a.getByLabel(/Selling price/)).fill(price);
    const cost = a.getByLabel(/Buying cost/).filter({ visible: true });
    if (await cost.getAttribute("required") !== null) await cost.fill(String(Math.round(Number(price) * 0.9)));
    if (returnItem) {
      await vis(a.getByLabel(/^RGB/)).check(); // the empty crate comes back
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
  async function order(page, customer, lines) {
    await page.goto(BASE + base + "/orders/new");
    await pick(page, "Customer", customer);
    for (let i = 0; i < lines.length; i++) {
      if (i > 0) await vis(page.getByRole("button", { name: "Add another product" })).click();
      await pick(page, i === 0 ? "Product" : `Product ${i + 1}`, lines[i][0]);
      await vis(page.getByLabel("Quantity")).nth(i).fill(String(lines[i][1]));
    }
    await vis(page.getByRole("button", { name: "Save order" })).click();
    await page.waitForURL(/\/orders\/[0-9a-f-]{36}\?saved=1/);
  }
  const crateCard = () => a.locator("section", { hasText: "Empties" }).filter({ hasText: "In store" });
  async function expectTotals(inStore, owed) {
    await go("/returns");
    const card = crateCard();
    await card.locator("div", { hasText: "In store" }).getByText(String(inStore), { exact: true }).waitFor();
    await card.locator("div", { hasText: "Owed by customers" }).getByText(String(owed), { exact: true }).waitFor();
  }

  // This business said at sign-up that nothing comes back: no Returns page,
  // and no return question on the product form.
  await addProduct("Water 75cl", "pack", "1800");
  await go("");
  await menu(a).getByRole("link", { name: "Orders", exact: true }).waitFor();
  assert.equal(await menu(a).getByRole("link", { name: "Returns", exact: true }).count(), 0);
  await go("/products/new");
  await vis(a.getByLabel("Product name")).waitFor();
  assert.equal(await a.getByLabel("Customers must bring something back").count(), 0);
  assert.equal(await a.getByLabel("Track each unit by serial number").count(), 0);
  // Switching returns on in Settings brings both back.
  await go("/settings");
  const features = a.locator("form", { has: a.getByText("How do you sell?") });
  await features.getByLabel("I sell drinks (RGB crates and PET packs)").check();
  await features.getByRole("button", { name: "Save" }).click();
  await features.getByText("Saved. The menus and forms now match what you sell.").waitFor();
  await menu(a).getByRole("link", { name: "Empties", exact: true }).waitFor();
  await addProduct("Cola 50cl", "crate", "4200", "Empties");
  // With a product that needs returns, returns cannot be switched off again.
  await go("/settings");
  await features.getByLabel("I sell drinks (RGB crates and PET packs)").uncheck();
  await features.getByRole("button", { name: "Save" }).click();
  await features.getByText("Returns cannot be switched off while Cola 50cl still needs something brought back.", { exact: false }).waitFor();
  ok("returns stay hidden until switched on in Settings, and cannot be switched off while a product needs them");

  await addCustomer("Mama Tunde Stores");
  await addCustomer("Alhaji Musa Kiosk");
  await go("/stock/receive");
  await pick(a, "Product", "Cola 50cl (crate)");
  await vis(a.getByLabel("Quantity")).fill("300");
  await vis(a.getByRole("button", { name: "Add another product" })).click();
  await pick(a, "Product 2", "Water 75cl (pack)");
  await vis(a.getByLabel("Quantity")).nth(1).fill("50");
  await vis(a.getByLabel("Supplier delivery reference")).fill("NBC-0001");
  await vis(a.getByLabel(/did the supplier take\?/)).fill("0");
  await vis(a.getByRole("button", { name: "Save and add to stock" })).click();
  await a.waitForURL(/\/stock\/receipts\//);

  // Opening count through the adjustment screen
  await expectTotals(0, 0);
  await a.getByRole("link", { name: "Add or subtract" }).click();
  await a.waitForURL(/\/returns\/adjust/);
  await vis(a.getByLabel(/How many Empties\?/)).fill("200");
  await vis(a.getByLabel("Reason")).selectOption({ label: "Opening empties (already in store)" });
  await a.screenshot({ path: `${SHOTS}/30-adjust.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save adjustment" })).click();
  await a.waitForURL(/\/returns\?saved=adjustment/);
  await a.getByText("Adjustment saved.").waitFor();
  await expectTotals(200, 0);
  ok("owner sets the opening count with an Add adjustment");

  // Orders -> trip -> dispatch: customers now owe
  await order(a, "Mama Tunde Stores", [["Cola 50cl", 40]]);
  await order(a, "Alhaji Musa Kiosk", [["Cola 50cl", 20], ["Water 75cl", 5]]);
  await addCrew(a, BASE + base, ["Musa Driver", "Tunde"]);
  await go("/dispatch/new");
  await vis(a.getByLabel("Driver", { exact: true })).selectOption({ label: "Musa Driver" });
  await vis(a.getByLabel("Sule")).check();
  await vis(a.getByRole("button", { name: "Choose all" })).click();
  await vis(a.getByRole("button", { name: "Create trip" })).click();
  await a.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/);
  const tripUrl = a.url();
  await expectTotals(200, 0); // not owed until it leaves
  await a.goto(tripUrl);
  await vis(a.getByRole("button", { name: "Dispatch now" })).click();
  await a.getByRole("button", { name: /^Yes, / }).click();
  await vis(a.getByRole("heading", { name: "Record what came back" })).waitFor();
  await expectTotals(200, 60);
  await a.locator("section", { hasText: "Trips to record returns for" }).getByText("Musa Driver").waitFor();
  const balances = a.locator("section", { hasText: "Empty shortages" });
  await balances.locator("li, tr", { hasText: "Mama Tunde Stores" }).getByText("40 owed").waitFor();
  await balances.locator("li, tr", { hasText: "Alhaji Musa Kiosk" }).getByText("20 owed").waitFor();
  await a.screenshot({ path: `${SHOTS}/31-returns-out.png`, fullPage: true });
  ok("dispatching makes each customer owe their crates");

  // Record returns with a shortage
  await a.locator("section", { hasText: "Trips to record returns for" }).getByRole("link").click();
  await a.waitForURL(tripUrl);
  const mamaBox = vis(a.getByLabel("Returned by Mama Tunde Stores"));
  assert.equal(await mamaBox.inputValue(), "40", "boxes start at the full amount");
  await mamaBox.fill("32");
  await a.getByText("Short by 8. It stays on their balance.").waitFor();
  await a.screenshot({ path: `${SHOTS}/32-record-returns.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Record returns and complete trip" })).click();
  const cameBack = a.locator("section", { hasText: "What came back" });
  await cameBack.locator("li, tr", { hasText: "Mama Tunde Stores" }).getByText("Short by 8").waitFor();
  await cameBack.locator("li, tr", { hasText: "Alhaji Musa Kiosk" }).getByText("All back").waitFor();
  await vis(a.getByText("Completed", { exact: true })).first().waitFor();
  assert.equal(await vis(a.getByRole("button", { name: "Record returns and complete trip" })).count(), 0);
  await a.screenshot({ path: `${SHOTS}/33-trip-returned.png`, fullPage: true });
  await expectTotals(252, 8);
  await a.locator("section", { hasText: "Empty shortages" }).locator("li, tr", { hasText: "Mama Tunde Stores" }).getByText("8 owed").waitFor();
  ok("returns are recorded per customer and the shortage stays on the customer's balance");

  // Supplier exchange
  await a.getByRole("link", { name: "Supplier took empties only" }).click();
  await a.waitForURL(/\/returns\/exchange/);
  await vis(a.getByLabel(/How many Empties did the supplier take\?/)).fill("9999");
  await vis(a.getByRole("button", { name: "Save exchange" })).click();
  await a.getByText("You only have 252 Empties in store here, so 9999 cannot be taken.").waitFor();
  await vis(a.getByLabel(/How many Empties did the supplier take\?/)).fill("150");
  await vis(a.getByLabel("Supplier (optional)")).fill("Bottling company");
  await vis(a.getByLabel("Delivery reference (optional)")).fill("WB-771");
  await a.screenshot({ path: `${SHOTS}/34-exchange.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save exchange" })).click();
  await a.waitForURL(/\/returns\?saved=EXC-/);
  await a.getByText(/Supplier exchange EXC-\d{8}-0001 saved\./).waitFor();
  await expectTotals(102, 8);
  ok("a supplier exchange takes crates out of the store, and cannot take more than there are");

  // Adjustment: customer brings crates without buying -> credit
  await go("/returns/adjust");
  await vis(a.getByLabel(/How many Empties\?/)).fill("10");
  await pick(a, "Which customer?", "Mama Tunde Stores");
  await vis(a.getByRole("button", { name: "Save adjustment" })).click();
  await a.waitForURL(/\/returns\?saved=adjustment/);
  await expectTotals(112, 0);
  await a.getByText("2 of those in store are held for customers in credit.").waitFor();
  await a.locator("section", { hasText: "Empty shortages" }).locator("li, tr", { hasText: "Mama Tunde Stores" }).getByText("2 in credit").waitFor();
  ok("Add with a customer: the store count rises and the customer's balance falls, into credit");

  // Adjustment: subtract damaged, and correction needs a note
  await go("/returns/adjust");
  await vis(a.getByText("− Subtract")).click();
  await vis(a.getByLabel(/How many Empties\?/)).fill("2");
  assert.equal(await vis(a.getByLabel("Which customer?")).count(), 0, "no customer for damaged or lost");
  await vis(a.getByRole("button", { name: "Save adjustment" })).click();
  await a.waitForURL(/\/returns\?saved=adjustment/);
  await expectTotals(110, 0);
  ok("Subtract for damaged or lost lowers the store count only");

  // Old debt
  await go("/returns/adjust");
  const debt = a.locator("section", { hasText: "A customer already owed some" });
  await pick(debt, "Customer", "Alhaji Musa Kiosk");
  await vis(debt.getByLabel(/How many Empties do they owe\?/)).fill("15");
  await vis(debt.getByRole("button", { name: "Record old debt" })).click();
  await a.getByText("Old debt recorded on the customer's balance.").waitFor();
  await expectTotals(110, 15);
  await go("/customers");
  await a.locator("li, tr", { hasText: "Alhaji Musa Kiosk" }).getByText("15 owed", { exact: true }).waitFor();
  await a.locator("li, tr", { hasText: "Mama Tunde Stores" }).getByText("2 in credit", { exact: true }).waitFor();
  await go("/returns");
  await a.locator("section", { hasText: "Latest movements" }).getByText("Taken by the supplier").waitFor();
  await a.screenshot({ path: `${SHOTS}/35-returns.png`, fullPage: true });
  ok("an old debt is recorded and shows on the customer list");

  // Credit counts against the next order: Mama (2 in credit) takes 12 -> owes 10
  await order(a, "Mama Tunde Stores", [["Cola 50cl", 12]]);
  await go("/dispatch/new");
  await vis(a.getByLabel("Driver", { exact: true })).selectOption({ label: "Tunde" });
  await vis(a.getByLabel("Sule")).check();
  await vis(a.getByRole("checkbox", { name: /Mama Tunde Stores/ })).check();
  await vis(a.getByRole("button", { name: "Create trip" })).click();
  await a.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/);
  await vis(a.getByRole("button", { name: "Dispatch now" })).click();
  await a.getByRole("button", { name: /^Yes, / }).click();
  await vis(a.getByRole("heading", { name: "Record what came back" })).waitFor();
  await go("/returns");
  await a.locator("section", { hasText: "Empty shortages" }).locator("li, tr", { hasText: "Mama Tunde Stores" }).getByText("10 owed").waitFor();
  ok("a customer's credit counts against their next order");

  // Staff on a phone: can exchange and record returns, cannot adjust
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
  await c.goto(BASE + base + "/returns");
  await c.getByRole("link", { name: "Supplier took empties only" }).waitFor();
  assert.equal(await c.getByRole("link", { name: "Add or subtract" }).count(), 0);
  await c.goto(BASE + base + "/returns/adjust");
  await c.waitForURL(new RegExp(base + "$"));
  await c.goto(BASE + base + "/returns");
  await c.locator("section", { hasText: "Trips to record returns for" }).getByRole("link").click();
  await c.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/);
  await vis(c.getByLabel("Returned by Mama Tunde Stores")).fill("12");
  await c.screenshot({ path: `${SHOTS}/36-record-returns-mobile.png`, fullPage: true });
  await vis(c.getByRole("button", { name: "Record returns and complete trip" })).click();
  await c.locator("section", { hasText: "What came back" }).getByText("All back").waitFor();
  ok("staff records returns on a phone but cannot open the adjustment screen");

  await go("");
  await a.getByRole("link", { name: /Owed back by customers/ }).getByText("15", { exact: true }).waitFor();
  await a.screenshot({ path: `${SHOTS}/37-dashboard.png`, fullPage: true });
  ok("dashboard shows the total owed back");

  await browser.close();
  const real = errors.filter((e) => !/404|Failed to load resource/.test(e));
  console.log("browser errors:", real.length ? real : "none");
  console.log(`${passed} steps passed`);
  if (real.length) process.exit(1);
})().catch((e) => { console.error("FAIL", e.message.split("\n").slice(0, 14).join("\n")); process.exit(1); });
