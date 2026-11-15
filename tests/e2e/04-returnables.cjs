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
    // Drinks are sold by the crate (RGB) or the pack (PET), so the unit is only asked otherwise.
    const soldBy = vis(a.getByLabel("Sold by the", { exact: true }));
    if (await soldBy.count()) await soldBy.fill(unit);
    await vis(a.getByLabel(/Selling price/)).fill(price);
    const cost = a.getByLabel(/Buying cost/).filter({ visible: true });
    if (await cost.getAttribute("required") !== null) await cost.fill(String(Math.round(Number(price) * 0.9)));
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
  async function order(page, customer, lines) {
    // A drinks order is RGB or PET: Water is PET.
    const kind = lines.every(([name]) => /Water/.test(name)) ? "&kind=pet" : "";
    await page.goto(BASE + base + "/orders/new?single=1" + kind);
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
  await order(a, "Alhaji Musa Kiosk", [["Cola 50cl", 20]]);
  await order(a, "Alhaji Musa Kiosk", [["Water 75cl", 5]]);
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
  // Drinks: a shortage is per order, and only once the trip's returns are in.
  await a.locator("section", { hasText: "Empty shortages" }).getByText("No order is waiting for empties.").waitFor();
  await a.screenshot({ path: `${SHOTS}/31-returns-out.png`, fullPage: true });
  ok("dispatching makes customers owe their crates; no shortage until the trip comes back");

  // Record returns with a shortage
  await a.locator("section", { hasText: "Trips to record returns for" }).getByRole("link").click();
  await a.waitForURL(tripUrl);
  const mamaBox = vis(a.getByLabel("Returned by Mama Tunde Stores"));
  assert.equal(await mamaBox.inputValue(), "", "boxes start empty");
  await vis(a.getByRole("button", { name: "Record returns and complete trip" })).click();
  await a.getByText(/^Enter how many Empties .+ brought back, 0 if none\.$/).waitFor();
  assert.equal(
    await a.evaluate(() => document.activeElement?.getAttribute("aria-label")?.startsWith("Returned by")),
    true,
    "the first blank box is focused"
  );
  await mamaBox.fill("32");
  await vis(a.getByRole("button", { name: "Record returns and complete trip" })).click();
  await a.getByText("Enter how many Empties Alhaji Musa Kiosk brought back, 0 if none.").waitFor();
  await vis(a.getByLabel("Returned by Alhaji Musa Kiosk")).fill("20");
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

  // Empty exchange: its own form, list and record, not part of a delivery
  await a.getByRole("link", { name: "Empty exchange", exact: true }).click();
  await a.waitForURL(/\/returns\/exchange$/);
  await vis(a.getByLabel("Empties taken by the supplier")).fill("9999");
  await vis(a.getByLabel("Supplier delivery reference")).fill("WB-771");
  await vis(a.getByRole("button", { name: "Save exchange" })).click();
  await a.getByText("You only have 252 Empties in store here, so 9999 cannot be taken.").waitFor();
  await vis(a.getByLabel("Empties taken by the supplier")).fill("150");
  await vis(a.getByLabel("RGB crates delivered (optional)")).fill("200");
  await vis(a.getByLabel("Supplier (optional)")).fill("Bottling company");
  await a.screenshot({ path: `${SHOTS}/34-exchange.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save exchange" })).click();
  await a.waitForURL(/\/returns\/exchanges\/[0-9a-f-]{36}\?saved=1$/);
  await a.getByRole("heading", { name: /^EXC-\d{8}-0001$/ }).waitFor();
  await a.getByText("RGB crates delivered", { exact: true }).waitFor();
  await a.getByRole("link", { name: "Back to all exchanges" }).click();
  await a.locator("tr", { hasText: "WB-771" }).getByText("150 Empties").waitFor();
  await expectTotals(102, 8);
  ok("a supplier exchange takes crates out of the store, and cannot take more than there are");

  // Drinks: no customer on an adjustment; what a customer brings back goes against their order.
  await go("/returns/adjust");
  const reasons = await vis(a.getByLabel("Reason")).locator("option").allInnerTexts();
  assert.ok(!reasons.includes("A customer brought them back"), "no customer reasons for drinks");
  assert.equal(await a.getByText("A customer already owed some").count(), 0, "no old debts for drinks");
  await go("/returns/customer-return");
  await pick(a, "Customer", "Mama Tunde Stores");
  await vis(a.getByLabel("How many empties did they bring?")).fill("10");
  await vis(a.getByRole("button", { name: "Save" })).click();
  await a.getByText("Only 8 empties are still owed on ORD-", { exact: false }).waitFor();
  await vis(a.getByLabel("How many empties did they bring?")).fill("8");
  await vis(a.getByRole("button", { name: "Save" })).click();
  await a.waitForURL(/\/returns\/shortages\?saved=followup/);
  await a.locator("tr", { hasText: "Mama Tunde Stores" }).getByText("Completed", { exact: true }).waitFor();
  await expectTotals(110, 0);
  ok("a customer brings back what one order owes, never more, and nothing becomes credit");

  // Adjustment: subtract damaged, and correction needs a note
  await go("/returns/adjust");
  await vis(a.getByText("− Subtract")).click();
  await vis(a.getByLabel(/How many Empties\?/)).fill("2");
  assert.equal(await vis(a.getByLabel("Which customer?")).count(), 0, "no customer for damaged or lost");
  await vis(a.getByRole("button", { name: "Save adjustment" })).click();
  await a.waitForURL(/\/returns\?saved=adjustment/);
  await expectTotals(108, 0);
  ok("Subtract for damaged or lost lowers the store count only");

  await go("/returns");
  await a.locator("section", { hasText: "Latest movements" }).getByText("Taken by the supplier").waitFor();
  await a.locator("section", { hasText: "Latest movements" }).getByText("Brought back later (follow-up)").waitFor();
  await a.screenshot({ path: `${SHOTS}/35-returns.png`, fullPage: true });
  ok("follow-ups and supplier exchanges show in the latest movements");

  // A new order owes in full: there is no credit from before.
  await order(a, "Mama Tunde Stores", [["Cola 50cl", 12]]);
  // Straight from the order to a trip: the order comes already ticked.
  assert.equal(await vis(a.getByText("Void this order", { exact: true })).count(), 0, "a waiting order is cancelled, not voided");
  await a.locator("main").getByRole("link", { name: "Put on a trip" }).click();
  await a.waitForURL(/\/dispatch\/new\?order=/);
  assert.equal(await vis(a.getByRole("checkbox", { name: /Mama Tunde Stores/ })).isChecked(), true, "order is preselected");
  await vis(a.getByLabel("Driver", { exact: true })).selectOption({ label: "Tunde" });
  await vis(a.getByLabel("Sule")).check();
  await vis(a.getByRole("button", { name: "Create trip" })).click();
  await a.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/);
  await vis(a.getByRole("button", { name: "Dispatch now" })).click();
  await a.getByRole("button", { name: /^Yes, / }).click();
  await vis(a.getByRole("heading", { name: "Record what came back" })).waitFor();
  await expectTotals(108, 12);
  ok("a new order is put on a trip straight from its page, and owes its crates in full");

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
  await c.getByRole("link", { name: "Empty exchange", exact: true }).waitFor();
  assert.equal(await c.getByRole("link", { name: "Add or subtract" }).count(), 0);
  // Follow-up returns are for owners and admins, as in Bilikis.
  assert.equal(await c.getByRole("link", { name: "Customer brought back empties" }).count(), 0);
  await c.goto(BASE + base + "/returns/customer-return");
  await c.waitForURL(new RegExp(base + "$"));
  await c.goto(BASE + base + "/returns");
  await c.goto(BASE + base + "/returns/adjust");
  await c.waitForURL(new RegExp(base + "$"));
  await c.goto(BASE + base + "/returns");
  await c.locator("section", { hasText: "Trips to record returns for" }).getByRole("link").click();
  await c.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/);
  await vis(c.getByLabel("Returned by Mama Tunde Stores")).fill("12");
  await c.screenshot({ path: `${SHOTS}/36-record-returns-mobile.png`, fullPage: true });
  await vis(c.getByRole("button", { name: "Record returns and complete trip" })).click();
  await c.locator("section", { hasText: "What came back" }).getByText("All back").waitFor();
  ok("staff records trip returns on a phone but cannot adjust or record follow-ups");

  await go("");
  await a.getByRole("link", { name: /Owed back by customers/ }).getByText("0", { exact: true }).waitFor();
  await a.screenshot({ path: `${SHOTS}/37-dashboard.png`, fullPage: true });
  ok("dashboard shows the total owed back");

  await browser.close();
  const real = errors.filter((e) => !/404|Failed to load resource/.test(e));
  console.log("browser errors:", real.length ? real : "none");
  console.log(`${passed} steps passed`);
  if (real.length) process.exit(1);
})().catch((e) => { console.error("FAIL", e.message.split("\n").slice(0, 14).join("\n")); process.exit(1); });
