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
  await vis(a.getByLabel("Sold by the")).fill("crate");
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
  await vis(a.getByLabel("Sold by the")).fill("pack");
  await vis(a.getByLabel(/Selling price/)).fill("3000");
  await vis(a.getByLabel(/Buying cost/)).fill("2700");
  assert.equal(await vis(a.getByLabel(/^PET, can or carton/)).isChecked(), true, "PET is the default");
  assert.equal(await vis(a.getByLabel("Category")).inputValue(), "PET");
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

  // 4. NBC delivery: 500 RGB crates in, 250 empties taken
  await go("/stock/receive");
  await pick(a, "Product", "Coca-Cola 50cl RGB");
  await vis(a.getByLabel("Quantity")).fill("500");
  await vis(a.getByRole("button", { name: "Add another product" })).click();
  await pick(a, "Product 2", "Coca-Cola 50cl PET");
  await vis(a.getByLabel("Quantity")).nth(1).fill("40");
  await vis(a.getByLabel("Supplier", { exact: true })).fill("NBC");
  await vis(a.getByLabel("Supplier delivery reference")).fill("NBC-7781");
  const given = vis(a.getByLabel("How many empties did the supplier take?"));
  assert.equal(await given.inputValue(), "500", "starts at the RGB crates received, not the PET");
  await given.fill("250");
  await a.screenshot({ path: `${SHOTS}/92-delivery-with-empties.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save and add to stock" })).click();
  await a.waitForURL(/\/stock\/receipts\/[0-9a-f-]{36}\?saved=1/);
  await a.getByText(/^250 \(EXC-\d{8}-0001\)$/).waitFor();
  await a.getByText("NBC-7781").waitFor();
  // Each delivery line keeps its buying cost.
  await a.locator("tr", { hasText: "Coca-Cola 50cl RGB" }).getByText("₦3,900", { exact: true }).waitFor();

  // After offloading: 12 crates broken, handed back to NBC. Correct the delivery.
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
  ok("an NBC delivery records the empties taken in the same go, and only 250 come off");

  // Cannot give more empties than are in store; nothing is saved.
  await go("/stock/receive");
  await pick(a, "Product", "Coca-Cola 50cl RGB");
  await vis(a.getByLabel("Quantity")).fill("10");
  await vis(a.getByLabel("Supplier delivery reference")).fill("NBC-7782");
  await vis(a.getByLabel("How many empties did the supplier take?")).fill("300");
  await vis(a.getByRole("button", { name: "Save and add to stock" })).click();
  await a.getByText("You only have 250 Empties in store here, so 300 cannot be taken.", { exact: false }).waitFor();
  await go("/stock");
  await a.locator("li, tr", { hasText: "Coca-Cola 50cl RGB" }).getByText("488", { exact: true }).waitFor();
  // A drinks depot sees its stock by category, RGB first.
  const headings = await a.locator("main section h2").allInnerTexts();
  assert.deepEqual(headings.slice(0, 3), ["RGB", "PET", "Juice"]);
  ok("a delivery cannot take more empties than are in store, and then saves nothing");

  // 5. RGB and PET on one trip; only the RGB crates are owed back
  await go("/customers/new");
  await vis(a.getByLabel("Customer name")).fill("Mama Tunde Stores");
  await vis(a.getByRole("button", { name: "Save customer" })).click();
  await a.waitForURL(new RegExp(base + "/customers$"));
  await go("/orders/new");
  await pick(a, "Customer", "Mama Tunde Stores");
  await pick(a, "Product", "Coca-Cola 50cl RGB");
  await vis(a.getByLabel("Quantity")).fill("50");
  await vis(a.getByRole("button", { name: "Add another product" })).click();
  await pick(a, "Product 2", "Coca-Cola 50cl PET");
  await vis(a.getByLabel("Quantity")).nth(1).fill("5");
  await vis(a.getByRole("button", { name: "Save order" })).click();
  await a.waitForURL(/\/orders\/[0-9a-f-]{36}\?saved=1/);
  const firstOrderNo = await a.getByRole("heading", { level: 1 }).innerText();

  // Like Bilikis: one waiting RGB order per customer; edit that one instead.
  await go("/orders/new");
  await pick(a, "Customer", "Mama Tunde Stores");
  await pick(a, "Product", "Coca-Cola 50cl RGB");
  await vis(a.getByLabel("Quantity")).fill("2");
  await vis(a.getByRole("button", { name: "Save order" })).click();
  await a.getByText(`Mama Tunde Stores already has order ${firstOrderNo} with RGB crates waiting for dispatch.`, { exact: false }).waitFor();

  ok("Bilikis rules: a delivery corrected after offloading, and one waiting RGB order per customer");

  await go("/dispatch");
  await a.getByRole("link", { name: "Drivers and loaders" }).click();
  for (const [name, role] of [["Musa", "Driver"], ["Sule", "Loader"]]) {
    await vis(a.getByLabel("Name", { exact: true })).fill(name);
    await vis(a.getByLabel("Driver or loader?")).selectOption({ label: role });
    await vis(a.getByRole("button", { name: "Add to the list" })).click();
    await a.getByText(`${name} added.`).waitFor();
  }
  await a.locator("tr", { hasText: "Musa" }).getByText("Driver", { exact: true }).waitFor();
  await go("/dispatch/new");
  await vis(a.getByLabel("Driver's name")).fill("Musa");
  await vis(a.getByLabel("Truck")).fill("LAG-100-AA");
  await vis(a.getByLabel("Sule")).check();
  await vis(a.getByRole("checkbox", { name: /Mama Tunde Stores/ })).check();
  await vis(a.getByRole("button", { name: "Create trip" })).click();
  await a.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/);
  await a.getByText("To bring back: 50 Empties").waitFor();
  await a.getByRole("definition").filter({ hasText: "Sule" }).waitFor(); // the loader is on the trip
  await vis(a.getByRole("button", { name: "Dispatch now" })).click();
  await a.getByRole("button", { name: /^Yes, / }).click();
  const mamaBox = vis(a.getByLabel("Returned by Mama Tunde Stores"));
  await mamaBox.fill("30");
  await vis(a.getByRole("button", { name: "Record returns and complete trip" })).click();
  // Wait for the save itself: "Short by 20" also shows as a hint while typing.
  await vis(a.getByText("Completed", { exact: true })).first().waitFor();
  await a.locator("section", { hasText: "What came back" }).getByText("Short by 20").waitFor();
  await go("/returns");
  await card.locator("div", { hasText: "In store" }).getByText("280", { exact: true }).waitFor();
  await a.locator("section", { hasText: "Empty shortages" }).locator("li, tr", { hasText: "Mama Tunde Stores" }).getByText("20 owed").waitFor();
  ok("RGB and PET go on one trip; the 20 empties not brought back show as an empty shortage");

  // 6. The customer brings some back later, at the depot
  await a.getByRole("link", { name: "Customer brought back empties" }).click();
  await a.waitForURL(/\/returns\/customer-return/);
  await pick(a, "Customer", "Mama Tunde Stores");
  await vis(a.getByLabel("How many empties did they bring?")).fill("21");
  await vis(a.getByRole("button", { name: "Save" })).click();
  await a.getByText("Mama Tunde Stores owes 20 Empties, so 21 cannot be recorded.", { exact: false }).waitFor();
  await vis(a.getByLabel("How many empties did they bring?")).fill("15");
  await a.screenshot({ path: `${SHOTS}/93-customer-brought-back.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Save" })).click();
  await a.waitForURL(/\/returns\?saved=customer-return/);
  await card.locator("div", { hasText: "In store" }).getByText("295", { exact: true }).waitFor();
  await a.locator("section", { hasText: "Empty shortages" }).locator("li, tr", { hasText: "Mama Tunde Stores" }).getByText("5 owed").waitFor();
  await a.screenshot({ path: `${SHOTS}/94-empties-page.png`, fullPage: true });
  ok("a customer bringing back owed empties later settles the shortage and adds to the store");

  // Stock value at cost: 438 RGB at 3,900 and 35 PET at 2,700.
  await go("/reports/stock-value");
  await a.getByText("₦1,802,700").first().waitFor();
  await a.screenshot({ path: `${SHOTS}/96-stock-value.png`, fullPage: true });

  // Daily report, the Bilikis way
  await go("/reports/daily");
  await a.locator("section", { hasText: "Deliveries received (1)" }).locator("tr", { hasText: "NBC-7781" }).getByText("250", { exact: true }).waitFor();
  const emptiesDay = a.locator("section", { hasText: "Empties in and out" });
  const line = async (label) => (await emptiesDay.locator("li, tr", { hasText: label }).innerText()).split("\n").pop().trim();
  assert.equal(await line("Came back with trips"), "+30");
  assert.equal(await line("Customers brought back at the depot"), "+15");
  assert.equal(await line("Opening count, purchases and corrections"), "+500");
  assert.equal(await line("Taken by the supplier"), "−250");
  await a.locator("section", { hasText: "Still open right now" }).getByText("Empty shortages: 1 customer").waitFor();
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
