// A drinks depot's day, the way Bilikis runs it: opening empties, an NBC
// delivery that takes empties back, RGB crates out on a trip, a shortage, and
// the customer settling it later at the depot.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { pick } = require("./helpers.cjs");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.argv[2] ?? require("node:os").tmpdir();
const MAIL = `${process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324"}/api/v1`;
const run = Date.now().toString(36);
const owner = `bilikis-${run}@example.com`;
let passed = 0;
const ok = (name) => { passed++; console.log("PASS", name); };
const vis = (locator) => locator.filter({ visible: true });
const menu = (page) => page.getByRole("navigation", { name: "Business" });

async function confirmationLink(email) {
  for (let i = 0; i < 20; i++) {
    const found = await (await fetch(`${MAIL}/search?query=${encodeURIComponent("to:" + email)}`)).json();
    if (found.messages?.length) {
      const message = await (await fetch(`${MAIL}/message/${found.messages[0].ID}`)).json();
      return (message.HTML || message.Text).match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error("no confirmation email for " + email);
}

let dbg;
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const page = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  const a = page;
  dbg = a;

  // 1. Sign up as a drinks depot
  await a.goto(BASE + "/signup");
  await a.getByLabel("Your full name").fill("Bilikis Ade");
  await a.getByLabel("Email", { exact: true }).fill(owner);
  await a.getByLabel("Password").fill("correct-horse-9");
  await a.getByRole("button", { name: "Create account" }).click();
  await a.getByText(`We sent a confirmation link to ${owner}`).waitFor();
  await a.goto(await confirmationLink(owner));
  await a.waitForURL("**/onboarding");
  await a.getByLabel("Business name").fill(`Bilikis Drinks ${run}`);
  await a.getByText("I count my goods").click();
  await a.getByLabel("I sell drinks (RGB crates and PET packs)").check();
  await a.screenshot({ path: `${SHOTS}/90-drinks-signup.png`, fullPage: true });
  await a.getByRole("button", { name: "Create business" }).click();
  await a.waitForURL(/\/b\/bilikis-drinks-/);
  const base = new URL(a.url()).pathname;
  const go = (path) => a.goto(BASE + base + path);
  await menu(a).getByRole("link", { name: "Empties", exact: true }).waitFor();
  await a.getByRole("link", { name: "Count your opening empties" }).waitFor();
  ok("a drinks depot signs up and gets an Empties page and an opening-empties step");

  // 2. Products: RGB or PET, never a typed return name; price and cost required
  await go("/products/new");
  await vis(a.getByLabel("Product name")).fill("Coca-Cola 50cl RGB");
  // Not asked what it is sold by: RGB is by the crate, PET by the pack.
  assert.equal(await vis(a.getByLabel("Sold by the", { exact: true })).count(), 0);
  assert.equal(await vis(a.getByLabel(/Selling price/)).getAttribute("required"), "");
  assert.equal(await vis(a.getByLabel(/Buying cost/)).getAttribute("required"), "");
  assert.equal(await a.getByLabel("What must they bring back?").count(), 0);
  await vis(a.getByLabel(/Selling price/)).fill("4200");
  await vis(a.getByLabel(/Buying cost/)).fill("3900");
  await vis(a.getByLabel(/^RGB/)).check();
  await a.screenshot({ path: `${SHOTS}/91-drink-product.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save product" })).click();
  await a.waitForURL(new RegExp(base + "/products$"));
  await go("/products/new");
  await vis(a.getByLabel("Product name")).fill("Coca-Cola 50cl PET");
  await vis(a.getByLabel(/Selling price/)).fill("3000");
  await vis(a.getByLabel(/Buying cost/)).fill("2700");
  // Neither kind nor category is picked for you.
  assert.equal(await vis(a.getByLabel(/^PET, can or carton/)).isChecked(), false);
  await vis(a.getByLabel(/^PET, can or carton/)).check();
  assert.equal(await vis(a.getByLabel("Category")).inputValue(), "", "the category starts empty");
  await vis(a.getByLabel("Category")).selectOption("PET");
  await vis(a.getByRole("button", { name: "Save product" })).click();
  await a.waitForURL(new RegExp(base + "/products$"));
  await a.locator("li, tr", { hasText: "Coca-Cola 50cl RGB" }).getByText("RGB", { exact: true }).waitFor();
  await a.locator("li, tr", { hasText: "Coca-Cola 50cl PET" }).getByText("PET", { exact: true }).waitFor();
  ok("each drink is RGB or PET, and cannot be saved without its price and cost");

  // The NBC list: tick, enter price and cost, add.
  await go("/products");
  await a.getByRole("link", { name: "Add from the NBC list" }).click();
  await a.waitForURL(/\/products\/nbc$/);
  await vis(a.getByLabel("Add FANTA ULTRA 50CL X24 RGB")).check();
  await vis(a.getByLabel("Add 5ALIVE ORANGE 30CL X12 PET")).check();
  await vis(a.getByLabel("Selling price for FANTA ULTRA 50CL X24 RGB")).fill("4200");
  await vis(a.getByLabel("Buying cost for FANTA ULTRA 50CL X24 RGB")).fill("3900");
  await vis(a.getByLabel("Selling price for 5ALIVE ORANGE 30CL X12 PET")).fill("5000");
  await vis(a.getByLabel("Buying cost for 5ALIVE ORANGE 30CL X12 PET")).fill("4500");
  await a.screenshot({ path: `${SHOTS}/95-nbc-list.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Add 2 products" })).click();
  await a.waitForURL(/\/products\?added=2/);
  await a.getByText("2 products added.").waitFor();
  await a.locator("li, tr", { hasText: "FANTA ULTRA 50CL X24 RGB" }).getByText("RGB", { exact: true }).waitFor();
  await go("/products/nbc");
  await a.locator("tr", { hasText: "FANTA ULTRA 50CL X24 RGB" }).getByText("Already added").waitFor();
  ok("drinks can be added from the NBC list, each with its own price and cost");

  // 3. Opening empties: an ordinary adjustment, started from the checklist
  await go("");
  await a.getByRole("link", { name: "Count your opening empties" }).click();
  await a.waitForURL(/\/returns\/adjust\?reason=opening_count/);
  assert.equal(
    await vis(a.getByLabel("Reason")).locator("option:checked").innerText(),
    "Opening empties (already in store)"
  );
  await vis(a.getByLabel(/How many Empties\?/)).fill("500");
  await vis(a.getByRole("button", { name: "Save adjustment" })).click();
  await a.waitForURL(/\/returns\?saved=adjustment/);
  const card = a.locator("section", { hasText: "In store" }).filter({ hasText: "Empties" });
  await card.locator("div", { hasText: "In store" }).getByText("500", { exact: true }).waitFor();
  await go("");
  assert.equal(await a.getByRole("link", { name: "Count your opening empties" }).count(), 0, "step done");
  ok("opening empties are added as an adjustment and the count starts at 500");

  // 4. NBC delivery: 500 RGB crates in; then, on its own sheet, 250 empties taken
  await go("/stock/receive");
  await pick(a, "Product", "Coca-Cola 50cl RGB");
  await vis(a.getByLabel("Quantity")).fill("500");
  await vis(a.getByRole("button", { name: "Add another product" })).click();
  await pick(a, "Product 2", "Coca-Cola 50cl PET");
  await vis(a.getByLabel("Quantity")).nth(1).fill("40");
  await vis(a.getByLabel("Supplier", { exact: true })).fill("NBC");
  await vis(a.getByLabel("Supplier delivery reference")).fill("NBC-7781");
  // The stock-in form has no empties: those are an exchange of their own.
  assert.equal(await a.getByLabel(/did the supplier take/).count(), 0);
  await a.screenshot({ path: `${SHOTS}/92-delivery.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save and add to stock" })).click();
  await a.waitForURL(/\/stock\/receipts\/[0-9a-f-]{36}\?saved=1/);
  await a.getByText("NBC-7781").waitFor();
  const deliveryUrl = a.url();
  // Each delivery line keeps its buying cost.
  await a.locator("tr", { hasText: "Coca-Cola 50cl RGB" }).getByText("₦3,900", { exact: true }).waitFor();

  // The empty exchange, from the Empty exchanges page in the menu.
  await menu(a).getByRole("link", { name: "Empty exchanges" }).click();
  await a.getByText("No exchanges yet.").waitFor();
  await a.locator("main").getByRole("link", { name: "+ New exchange" }).click();
  await a.waitForURL(/\/returns\/exchange$/);
  await vis(a.getByLabel("Empties taken by the supplier")).fill("250");
  // The supplier's delivery reference is required, as in Bilikis.
  assert.equal(await vis(a.getByLabel("Supplier delivery reference")).getAttribute("required"), "");
  await vis(a.getByLabel("Supplier delivery reference")).fill("NBC-7781");
  await vis(a.getByLabel("RGB crates delivered (optional)")).fill("500");
  await a.screenshot({ path: `${SHOTS}/92-empty-exchange.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save exchange" })).click();
  await a.waitForURL(/\/returns\/exchanges\/[0-9a-f-]{36}\?saved=1$/);
  await a.getByRole("heading", { name: /^EXC-\d{8}-0001$/ }).waitFor();
  await a.getByText("250 Empties", { exact: true }).first().waitFor();
  await a.getByRole("link", { name: "Back to all exchanges" }).click();
  const exchangeRow = a.locator("tr", { hasText: "NBC-7781" });
  await exchangeRow.getByText("250 Empties").waitFor();
  await exchangeRow.getByText("500", { exact: true }).waitFor();
  await a.screenshot({ path: `${SHOTS}/92-empty-exchanges.png`, fullPage: true });

  // After offloading: 12 crates broken, handed back to NBC. Correct the delivery.
  await a.goto(deliveryUrl);
  await vis(a.getByRole("link", { name: "Correct this delivery" })).click();
  await a.waitForURL(/\/correct$/);
  // Lines are in name order: Coca-Cola 50cl PET, then Coca-Cola 50cl RGB.
  assert.equal(await vis(a.getByLabel("Quantity")).nth(1).inputValue(), "500");
  await vis(a.getByLabel("Quantity")).nth(1).fill("488");
  await vis(a.getByLabel("Reason for the correction")).fill("12 crates broken, handed back to NBC");
  await a.screenshot({ path: `${SHOTS}/98-correct-delivery.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save correction" })).click();
  await a.waitForURL(/\?corrected=1/);
  await a.getByText("Correction saved. Stock and the reports have been updated.").waitFor();
  await a.locator("section", { hasText: "Corrections" }).locator("tr", { hasText: "Coca-Cola 50cl RGB" }).getByText("500 → 488 crate").waitFor();
  await go("/returns");
  await card.locator("div", { hasText: "In store" }).getByText("250", { exact: true }).waitFor();
  ok("an NBC delivery adds stock, and the empties taken are recorded on their own exchange sheet");

  // An exchange cannot take more empties than are in store; nothing is saved.
  await go("/returns/exchange");
  await vis(a.getByLabel("Supplier delivery reference")).fill("NBC-7782");
  await vis(a.getByLabel("Empties taken by the supplier")).fill("300");
  await vis(a.getByRole("button", { name: "Save exchange" })).click();
  await a.getByText("You only have 250 Empties in store here, so 300 cannot be taken.", { exact: false }).waitFor();
  await go("/stock/summary");
  await a.locator("li, tr", { hasText: "Coca-Cola 50cl RGB" }).locator("[data-current-stock]").getByText("488", { exact: true }).waitFor();
  // As in Bilikis: one table in NBC order, RGB crates first, with each row's category.
  const categories = await a.locator("main tbody tr").evaluateAll((rows) =>
    rows.map((row) => row.querySelectorAll("td")[5]?.innerText.trim())
  );
  assert.equal(categories[0], "RGB");
  assert.ok(categories.indexOf("PET") > categories.lastIndexOf("RGB"), "PET after every RGB product");
  ok("an exchange cannot take more empties than are in store");

  // 5. Several customers on one order screen, with Stock left counting down
  for (const name of ["Mama Tunde Stores", "Alhaji Musa Kiosk"]) {
    await go("/customers/new");
    await vis(a.getByLabel("Customer name")).fill(name);
    await vis(a.getByRole("button", { name: "Save customer" })).click();
    await a.waitForURL(new RegExp(base + "/customers$"));
  }
  // RGB orders first: the RGB tab offers only RGB drinks.
  await go("/orders/new");
  await a.getByRole("heading", { name: "New RGB orders" }).waitFor();
  const stockLeft = async (product) =>
    (await a.getByLabel(`Stock left for ${product}`).first().innerText()).replace("Stock left: ", "");
  assert.equal(await stockLeft("Coca-Cola 50cl RGB"), "488");
  assert.equal(await a.getByLabel("Stock left for Coca-Cola 50cl PET").count(), 0, "no PET on the RGB tab");
  // Saving with nothing chosen points at the customer still missing.
  await vis(a.getByRole("button", { name: "Save order" })).click();
  await a.getByText("Choose customer 1 before saving.").waitFor();
  const first = a.getByRole("region", { name: "Customer 1" });
  await pick(first, "Customer", "Mama Tunde Stores");
  await first.getByRole("button", { name: "Add Coca-Cola 50cl RGB for customer 1" }).click();
  await first.getByLabel("Coca-Cola 50cl RGB for customer 1").fill("50");
  assert.equal(await stockLeft("Coca-Cola 50cl RGB"), "438", "the counter drops as the quantity is typed");
  await vis(a.getByRole("button", { name: "Save order" })).click();
  await a.waitForURL(/\/orders\?saved=batch/);
  await a.getByText("1 order saved.").waitFor();

  // Then PET, on its own tab: two customers, and Stock left counts down across both.
  await go("/orders/new");
  await a.getByRole("link", { name: "PET orders" }).click();
  await a.getByRole("heading", { name: "New PET orders" }).waitFor();
  assert.equal(await a.getByLabel("Stock left for Coca-Cola 50cl RGB").count(), 0, "no RGB on the PET tab");
  const petFirst = a.getByRole("region", { name: "Customer 1" });
  await pick(petFirst, "Customer", "Mama Tunde Stores");
  await petFirst.getByRole("button", { name: "Add Coca-Cola 50cl PET for customer 1" }).click();
  await petFirst.getByLabel("Coca-Cola 50cl PET for customer 1").fill("5");
  await vis(a.getByRole("button", { name: "Add customer" })).click();
  const second = a.getByRole("region", { name: "Customer 2" });
  await pick(second, "Customer", "Alhaji Musa Kiosk");
  await second.getByRole("button", { name: "Add Coca-Cola 50cl PET for customer 2" }).click();
  // More than is left is capped at what is left: 40 PET came in, Mama takes 5.
  await second.getByLabel("Coca-Cola 50cl PET for customer 2").fill("99");
  assert.equal(await second.getByLabel("Coca-Cola 50cl PET for customer 2").inputValue(), "35");
  assert.equal(await stockLeft("Coca-Cola 50cl PET"), "0");
  await second.getByLabel("Coca-Cola 50cl PET for customer 2").fill("10");
  assert.equal(await stockLeft("Coca-Cola 50cl PET"), "25");
  await a.getByText("Total quantity").waitFor();
  await a.screenshot({ path: `${SHOTS}/90-batch-order.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save 2 orders" })).click();
  await a.waitForURL(/\/orders\?saved=batch/);
  await a.getByText("2 orders saved.").waitFor();
  const batchUrl = a.url();
  // RGB orders on top with their empties, PET orders below.
  await a.locator("section", { hasText: "RGB orders" }).locator("tr", { hasText: "Mama Tunde Stores" }).getByText("50", { exact: true }).waitFor();
  await a.locator("section", { hasText: "PET orders" }).locator("tr", { hasText: "Alhaji Musa Kiosk" }).waitFor();
  await a.screenshot({ path: `${SHOTS}/90-orders-two-sections.png`, fullPage: true });
  ok("several customers are ordered on one screen, and Stock left counts down across all of them");

  // Like Bilikis: one waiting RGB order per customer; edit that one instead.
  await go("/orders/new");
  await pick(a.getByRole("region", { name: "Customer 1" }), "Customer", "Mama Tunde Stores");
  await a.getByRole("button", { name: "Add Coca-Cola 50cl RGB for customer 1" }).click();
  await a.getByLabel("Coca-Cola 50cl RGB for customer 1").fill("2");
  await vis(a.getByRole("button", { name: "Save order" })).click();
  await a.getByText("Mama Tunde Stores already has order", { exact: false }).waitFor();
  ok("Bilikis rules: a delivery corrected after offloading, and one waiting RGB order per customer");

  await go("/dispatch");
  await a.getByRole("link", { name: "Drivers and workers" }).click();
  for (const [name, role] of [["Musa", "Driver"], ["Sule", "Worker"]]) {
    await vis(a.getByLabel("Name", { exact: true })).fill(name);
    await vis(a.getByLabel("Driver or worker?")).selectOption({ label: role });
    await vis(a.getByRole("button", { name: "Add to the list" })).click();
    await a.getByText(`${name} added.`).waitFor();
  }
  await a.locator("tr", { hasText: "Musa" }).getByText("Driver", { exact: true }).waitFor();
  // Straight from the saved list to a trip, both orders already ticked.
  await a.goto(batchUrl);
  await a.getByRole("link", { name: "Put them on a trip" }).click();
  await a.waitForURL(/\/dispatch\/new\?order=/);
  // The two PET orders come ticked; Mama's RGB order goes on the same trip.
  assert.equal(await vis(a.getByRole("checkbox", { name: /Alhaji Musa Kiosk/ })).isChecked(), true);
  const mamaBoxes = vis(a.getByRole("checkbox", { name: /Mama Tunde Stores/ }));
  assert.equal(await mamaBoxes.count(), 2);
  for (let i = 0; i < 2; i++) await mamaBoxes.nth(i).check();
  await vis(a.getByLabel("Driver", { exact: true })).selectOption({ label: "Musa" });
  await vis(a.getByLabel("Sule")).check();
  await vis(a.getByRole("button", { name: "Create trip" })).click();
  await a.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/);
  const tripUrl = a.url();
  await a.getByText("To bring back: 50 Empties").waitFor();
  await a.getByRole("definition").filter({ hasText: "Sule" }).waitFor(); // the worker is on the trip
  await vis(a.getByRole("button", { name: "Dispatch now" })).click();
  await a.getByRole("button", { name: /^Yes, / }).click();
  // Only Mama took RGB crates, so only she has a box.
  const mamaBox = vis(a.getByLabel("Returned by Mama Tunde Stores"));
  await mamaBox.fill("30");
  assert.equal(await vis(a.getByLabel("Returned by Alhaji Musa Kiosk")).count(), 0);
  await vis(a.getByRole("button", { name: "Record returns and complete trip" })).click();
  // Wait for the save itself: "Short by 20" also shows as a hint while typing.
  await vis(a.getByText("Completed", { exact: true })).first().waitFor();
  await a.locator("section", { hasText: "What came back" }).getByText("Short by 20").waitFor();
  await go("/returns");
  await card.locator("div", { hasText: "In store" }).getByText("280", { exact: true }).waitFor();
  await a.locator("section", { hasText: "Empty shortages" }).locator("li, tr", { hasText: "Mama Tunde Stores" }).getByText("20 owed").waitFor();
  ok("RGB and PET go on one trip; the 20 empties not brought back show as an empty shortage on that order");

  // 6. The customer brings some back later: against that order, never more than it owes
  await a.getByRole("link", { name: "Customer brought back empties" }).click();
  await a.waitForURL(/\/returns\/customer-return/);
  await pick(a, "Customer", "Mama Tunde Stores");
  await vis(a.getByLabel("How many empties did they bring?")).fill("21");
  await vis(a.getByRole("button", { name: "Save" })).click();
  await a.getByText("Only 20 empties are still owed on ORD-", { exact: false }).waitFor();
  await vis(a.getByLabel("How many empties did they bring?")).fill("15");
  await a.screenshot({ path: `${SHOTS}/93-customer-brought-back.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save" })).click();
  await a.waitForURL(/\/returns\/shortages\?saved=followup/);
  const mamaLine = a.locator("tr", { hasText: "Mama Tunde Stores" });
  await mamaLine.getByText("Open", { exact: true }).waitFor();
  assert.deepEqual(
    (await mamaLine.locator("td").allInnerTexts()).slice(3, 7).map((text) => text.trim()),
    ["50", "30", "15", "5"],
    "expected, returned with the trip, follow-up, outstanding"
  );

  // The last 5, on the order's own page; the line is then completed and stays listed.
  await mamaLine.getByRole("link").first().click();
  await a.waitForURL(/\/orders\/[0-9a-f-]{36}$/);
  await a.getByText("Follow-up history").waitFor();
  await vis(a.getByLabel("How many empties did they bring?")).fill("5");
  await vis(a.getByRole("button", { name: "Record follow-up return" })).click();
  await vis(a.getByText("Follow-up return saved.")).first().waitFor();
  await vis(a.getByText("Completed", { exact: true })).first().waitFor();
  assert.equal(await vis(a.getByRole("button", { name: "Record follow-up return" })).count(), 0);
  await go("/returns/shortages");
  await a.locator("tr", { hasText: "Mama Tunde Stores" }).getByText("Completed", { exact: true }).waitFor();
  const completedOn = (await a.locator("tr", { hasText: "Mama Tunde Stores" }).locator("td").last().innerText()).trim();
  assert.match(completedOn, /\d{4}/, "the date and time it was completed are shown");
  await a.getByText("Outstanding empties").waitFor();
  await a.waitForTimeout(500); // let the page finish fading in
  await a.screenshot({ path: `${SHOTS}/94-empty-shortages.png`, fullPage: true });
  // On the orders page the RGB order shows 50 out, 50 back, done.
  await go("/orders");
  const rgbRow = a.locator("section", { hasText: "RGB orders" }).locator("tr", { hasText: "Mama Tunde Stores" });
  await rgbRow.getByText("Done", { exact: true }).waitFor();
  await a.waitForTimeout(500);
  await a.screenshot({ path: `${SHOTS}/94-orders-after-returns.png`, fullPage: true });
  await go("/returns");
  await card.locator("div", { hasText: "In store" }).getByText("300", { exact: true }).waitFor();
  await a.screenshot({ path: `${SHOTS}/95-empties-page.png`, fullPage: true });
  await a.goto(tripUrl);
  await a.locator("section", { hasText: "What came back" }).locator("tr", { hasText: "Mama Tunde Stores" }).getByText("20", { exact: true }).waitFor();
  ok("follow-ups pay off that order only; a completed shortage stays listed with when it was completed");

  // Stock value at cost: 438 RGB at 3,900 and 25 PET at 2,700.
  await go("/reports/stock-value");
  await a.getByText("₦1,775,700").first().waitFor();
  await a.screenshot({ path: `${SHOTS}/96-stock-value.png`, fullPage: true });

  // Daily report, the Bilikis way
  await go("/reports/daily");
  await a.locator("section", { hasText: "Stock received on" }).locator("tr", { hasText: "NBC-7781" }).waitFor();
  // Daily activity, as in Bilikis.
  const activity = a.locator("section", { hasText: "Daily activity on" });
  const activityRow = async (label) =>
    (await activity.locator("tr", { hasText: label }).locator("td").allInnerTexts()).map((text) => text.trim());
  assert.deepEqual((await activityRow("Initial RGB returns")).slice(1, 4), ["1", "30 empties received", "50 empties expected at closure"]);
  assert.deepEqual((await activityRow("Empty return follow-ups")).slice(1, 3), ["2", "20 empties received"]);
  assert.deepEqual((await activityRow("NBC empty exchange")).slice(1, 4), ["1", "250 empties out", "500 RGB cases delivered by NBC"]);
  assert.deepEqual((await activityRow("RGB sales recorded")).slice(1, 3), ["1", "50 crates"]);
  assert.deepEqual((await activityRow("PET sales recorded")).slice(1, 3), ["2", "15 packs"]);
  // Empty movements: in with the trip and later, out to NBC.
  const empties = a.locator("section", { hasText: "Empty movements on" });
  await empties.locator("tr", { hasText: "RGB trip return" }).getByText("+30").waitFor();
  await empties.locator("tr", { hasText: "NBC empty exchange" }).getByText("−250").waitFor();
  await empties.locator("tr", { hasText: "Empty adjustment" }).getByText("+500").waitFor();
  assert.equal(await empties.locator("tr", { hasText: "Return follow-up" }).count(), 2);
  // One trip carried both.
  await a.locator("section", { hasText: "Dispatches made on" }).getByText("RGB + PET").waitFor();
  const dayCard = (label) => a.locator("div", { hasText: label }).filter({ has: a.getByText(label, { exact: true }) }).last();
  assert.match(await dayCard("Empty balance at close").innerText(), /300$/);
  assert.match(await dayCard("Shortage follow-ups").innerText(), /0$/);
  await a.screenshot({ path: `${SHOTS}/97-daily-report.png`, fullPage: true });
  ok("stock value at cost, and a daily report with deliveries, empties in and out, and empty shortages");

  await browser.close();
  const real = errors.filter((e) => !/404|Failed to load resource/.test(e));
  console.log("browser errors:", real.length ? real : "none");
  console.log(`${passed} steps passed`);
  if (real.length) process.exit(1);
})().catch(async (e) => {
  try {
    await dbg.screenshot({ path: SHOTS + "/fail.png", fullPage: true });
    console.error("URL", dbg.url());
  } catch {}
  console.error("FAIL", e.message.split("\n").slice(0, 12).join("\n"));
  process.exit(1);
});
