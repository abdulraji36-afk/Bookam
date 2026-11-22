const { chromium } = require("playwright");
const { pick, addCrew, newOrders, receiveCards } = require("./helpers.cjs");
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

  // --- set-up through the UI (covered in detail by the earlier walkthrough)
  async function addProduct(name, unit, price, returnItem) {
    await a.goto(BASE + base + "/products/new");
    await vis(a.getByLabel("Product name")).fill(name);
    // Drinks are sold by the crate (RGB) or the pack (PET), so the unit is only asked otherwise.
    const soldBy = vis(a.getByLabel("Sold by the", { exact: true }));
    if (await soldBy.count()) await soldBy.fill(unit);
    await vis(a.getByLabel(/Selling price/)).fill(price);
    await vis(a.getByLabel(/Buying cost/)).fill(String(Math.round(Number(price.replace(/,/g, "")) * 0.9)));
    if (returnItem) {
      await vis(a.getByLabel(/^RGB/)).check(); // the empty crate comes back
    } else if (await vis(a.getByLabel(/^PET, can or carton/)).count()) {
      await vis(a.getByLabel(/^PET, can or carton/)).check();
      await vis(a.getByLabel("Category")).fill("PET");
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
  await receiveCards(a, [["Cola 50cl", 100], ["Water 75cl", 50]]);
  await vis(a.getByLabel("Supplier delivery reference")).fill("NBC-0001");
  await vis(a.getByRole("button", { name: "Save and add to stock" })).click();
  await a.waitForURL(/\/stock\/receipts\//);
  ok("set-up: 2 drinks, 2 customers, stock received");

  // --- one New order page: several customers, RGB and PET tabs
  const biz = BASE + base;
  const orderUrl = (id) => `${biz}/orders/${id}`;

  await nav(a, "Orders");
  await a.getByText("No orders yet").waitFor();
  await a.locator("main").getByRole("link", { name: "+ New order" }).click();
  await a.waitForURL(/\/orders\/new/);
  await a.getByRole("heading", { name: "New RGB orders" }).waitFor();
  // There is only this page: no switch to a one-order form.
  assert.equal(await a.getByRole("link", { name: /One order|Several customers/ }).count(), 0);
  // An RGB order is RGB only.
  assert.equal(await a.getByLabel("Stock left for Water 75cl").count(), 0, "no PET on the RGB tab");
  // The old one-order address brings you here.
  await a.goto(biz + "/orders/new?single=1&kind=pet");
  await a.waitForURL(biz + "/orders/new?kind=pet");
  await a.getByRole("heading", { name: "New PET orders" }).waitFor();

  const [mamaRgb] = await newOrders(a, biz, "rgb", [{ customer: "Mama Tunde Stores (Ikeja)", lines: [["Cola 50cl", 40]] }], {
    beforeSave: async () => {
      assert.equal(await a.getByLabel("Stock left for Cola 50cl").first().innerText(), "Stock left: 60");
      await a.getByText("₦168,000").waitFor();
      await a.screenshot({ path: `${SHOTS}/20-new-order.png`, fullPage: true });
    }
  });
  await a.goto(orderUrl(mamaRgb));
  await a.getByRole("heading", { name: /^ORD-\d{8}-0001$/ }).waitFor();
  await a.locator("tr", { hasText: "Cola 50cl" }).getByText("40 Empties", { exact: true }).waitFor();
  await a.getByText("Waiting for dispatch").first().waitFor();
  await a.screenshot({ path: `${SHOTS}/21-order.png`, fullPage: true });
  // Her PET drinks are an order of their own.
  await newOrders(a, biz, "pet", [{ customer: "Mama Tunde Stores (Ikeja)", lines: [["Water 75cl", 10]] }]);
  await a.goto(BASE + base + "/stock/summary");
  await a.locator("li, tr", { hasText: "Cola 50cl" }).locator("[data-current-stock]").getByText("60", { exact: true }).waitFor();
  // The orders page shows RGB orders on top and PET orders below.
  await a.goto(BASE + base + "/orders");
  await a.locator("section", { hasText: "RGB orders" }).locator("tr", { hasText: "Mama Tunde Stores" }).getByText("40", { exact: true }).waitFor();
  await a.locator("section", { hasText: "PET orders" }).locator("tr", { hasText: "Mama Tunde Stores" }).waitFor();
  await a.screenshot({ path: `${SHOTS}/21-orders-two-sections.png`, fullPage: true });
  ok("an order sets its stock aside and shows what is due back; RGB and PET are separate orders");

  // --- a missed customer or product takes you back to it with a message
  await a.goto(biz + "/orders/new?kind=pet");
  const save = () => vis(a.getByRole("button", { name: /^Save( \d+ orders| order)$/ })).click();
  await save();
  await a.getByText("Choose customer 1 before saving.").waitFor();
  const first = a.getByRole("region", { name: "Customer 1" });
  await pick(first, "Customer", "Grace Canteen");
  await save();
  await a.getByText("Add at least one product for Grace Canteen.").waitFor();
  assert.match(a.url(), /\/orders\/new(\?.*)?$/, "nothing was saved");
  ok("a missed customer or product is pointed out at the field itself");

  // --- cannot take more than is in stock: the quantity stops at what is left
  await newOrders(a, biz, "pet", [{ customer: "Grace Canteen", lines: [["Water 75cl", 99]] }], { save: false });
  const graceBox = a.getByRole("textbox", { name: "Water 75cl for customer 1" });
  assert.equal(await graceBox.inputValue(), "40", "capped at what is in stock");
  assert.equal(await a.getByLabel("Stock left for Water 75cl").first().innerText(), "Stock left: 0");
  await graceBox.fill("15");
  await save();
  await a.waitForURL(/\/orders\?saved=batch&ids=/);
  const graceOrderId = new URL(a.url()).searchParams.get("ids");
  await a.goto(orderUrl(graceOrderId));
  await a.getByRole("heading", { name: /^ORD-\d{8}-0003$/ }).waitFor();
  ok("an order cannot take more than is in stock");

  // --- edit while waiting
  await a.getByRole("link", { name: "Edit order" }).click();
  await a.waitForURL(/\/edit$/);
  await a.getByText("40 pack in stock").waitFor(); // 25 free + 15 this order holds
  await vis(a.getByLabel("Quantity")).fill("20");
  await vis(a.getByRole("button", { name: "Save changes" })).click();
  await a.waitForURL(/\/orders\/[0-9a-f-]{36}\?saved=1/);
  await a.locator("tr", { hasText: "Water 75cl" }).getByText("20 pack", { exact: true }).waitFor();
  await a.goto(BASE + base + "/stock/summary");
  await a.locator("li, tr", { hasText: "Water 75cl" }).locator("[data-current-stock]").getByText("20", { exact: true }).waitFor();
  ok("editing a waiting order adjusts the stock it holds");

  // --- trip: drivers and workers come from the list
  await addCrew(a, BASE + base, ["Musa", "Tunde"]);
  await nav(a, "Dispatch");
  await a.getByText("3 orders waiting to be put on a trip.").waitFor();
  await a.locator("main").getByRole("link", { name: "+ New trip" }).click();
  await a.waitForURL(/\/dispatch\/new/);
  await vis(a.getByLabel("Driver", { exact: true })).selectOption({ label: "Musa" });
  await vis(a.getByLabel("Sule")).check();
  await vis(a.getByRole("button", { name: "Create trip" })).click();
  await a.getByText("Choose at least one order to put on the trip.").waitFor();
  await vis(a.getByRole("button", { name: "Choose all" })).click();
  await a.getByText("Orders to load (3 chosen)").waitFor();
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
  const [cancelId] = await newOrders(a, biz, "pet", [{ customer: "Grace Canteen", lines: [["Water 75cl", 5]] }]);
  await a.goto(orderUrl(cancelId));
  await vis(a.getByRole("button", { name: "Cancel order" })).click();
  await a.getByRole("button", { name: /^Yes, / }).click();
  await a.getByText("Cancelled").first().waitFor();
  await a.goto(BASE + base + "/stock/summary");
  await a.locator("li, tr", { hasText: "Water 75cl" }).locator("[data-current-stock]").getByText("20", { exact: true }).waitFor();
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
  await newOrders(c, biz, "pet", [{ customer: "Grace Canteen", lines: [["Water 75cl", 4]] }], {
    beforeSave: () => c.screenshot({ path: `${SHOTS}/25-new-order-mobile.png`, fullPage: true })
  });
  await c.goto(BASE + base + "/dispatch/new");
  await vis(c.getByLabel("Driver", { exact: true })).selectOption({ label: "Tunde" });
  await vis(c.getByLabel("Sule")).check();
  await vis(c.getByRole("checkbox", { name: /Grace Canteen/ })).check();
  await vis(c.getByRole("button", { name: "Create trip" })).click();
  await c.waitForURL(/\/dispatch\/[0-9a-f-]{36}$/);
  assert.equal(await vis(c.getByRole("button", { name: "Cancel trip" })).count(), 0, "staff cannot cancel a trip");
  await vis(c.getByRole("button", { name: "Dispatch now" })).click();
  await c.getByRole("button", { name: /^Yes, / }).click();
  await c.getByText("Completed").first().waitFor();
  await c.screenshot({ path: `${SHOTS}/26-trip-mobile.png`, fullPage: true });
  ok("staff records an order, builds a trip and dispatches it from a phone");

  // --- owner can cancel a draft trip
  await newOrders(a, biz, "rgb", [{ customer: "Mama Tunde Stores (Ikeja)", lines: [["Cola 50cl", 5]] }]);
  await a.goto(BASE + base + "/dispatch/new");
  await vis(a.getByLabel("Driver", { exact: true })).selectOption({ label: "Musa" });
  await vis(a.getByLabel("Sule")).check();
  await vis(a.getByRole("checkbox", { name: /Mama Tunde Stores/ })).check();
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
  // A drinks dashboard has the Bilikis cards; the waiting orders are listed below them.
  const waitingList = a.locator("section").filter({ has: a.getByRole("heading", { name: "Waiting for dispatch", exact: true }) });
  await waitingList.locator("tbody tr", { hasText: "Mama Tunde Stores" }).waitFor();
  assert.equal(await waitingList.locator("tbody tr").count(), 1);
  await a.screenshot({ path: `${SHOTS}/28-dashboard.png`, fullPage: true });
  ok("dashboard shows what is waiting");

  // --- drinks are sold to saved customers only: no walk-in buyers, RGB or PET
  for (const kind of ["rgb", "pet"]) {
    await a.goto(biz + "/orders/new" + (kind === "pet" ? "?kind=pet" : ""));
    await a.getByRole("heading", { name: kind === "pet" ? "New PET orders" : "New RGB orders" }).waitFor();
    assert.equal(await a.getByRole("button", { name: /walk-in/i }).count(), 0, `no walk-in on ${kind}`);
  }
  // Nor when editing a waiting order.
  await a.goto(BASE + base + "/orders?status=waiting");
  await a.locator("tr", { hasText: "Mama Tunde Stores" }).first().getByRole("link").first().click();
  await vis(a.getByRole("link", { name: "Edit order" })).click();
  await a.waitForURL(/\/edit$/);
  assert.equal(await a.getByLabel("Walk-in buyer").count(), 0, "no walk-in when editing a drinks order");
  ok("drinks are sold to saved customers only, with no walk-in buyer anywhere")

  await browser.close();
  const real = errors.filter((e) => !/404|Failed to load resource/.test(e));
  console.log("browser errors:", real.length ? real : "none");
  console.log(`${passed} steps passed`);
  if (real.length) process.exit(1);
})().catch(async (e) => {
  try {
    await dbg?.screenshot({ path: SHOTS + "/fail.png", fullPage: true });
    console.error("URL", dbg?.url());
  } catch {}
  console.error("FAIL", e.message.split("\n").slice(0, 14).join("\n"));
  process.exit(1);
});
