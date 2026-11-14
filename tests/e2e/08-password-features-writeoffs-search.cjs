// Iteration 8: forgot password, the sign-up questions, stock write-offs, and
// search with paging on long lists.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { createClient } = require("@supabase/supabase-js");
const { pick } = require("./helpers.cjs");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.argv[2] ?? require("node:os").tmpdir();
const MAIL = `${process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324"}/api/v1`;
const run = Date.now().toString(36);
const owner = `tola-${run}@example.com`;
const OLD_PASSWORD = "correct-horse-9";
const NEW_PASSWORD = "battery-staple-42";
let passed = 0;
const ok = (name) => { passed++; console.log("PASS", name); };
const vis = (locator) => locator.filter({ visible: true });
const menu = (page) => page.getByRole("navigation", { name: "Business" });

/** The link in the newest email to `email` whose subject matches. */
async function emailLink(email, subject) {
  for (let i = 0; i < 30; i++) {
    const found = await (await fetch(`${MAIL}/search?query=${encodeURIComponent("to:" + email)}`)).json();
    const message = (found.messages ?? []).find((m) => subject.test(m.Subject));
    if (message) {
      const full = await (await fetch(`${MAIL}/message/${message.ID}`)).json();
      return (full.HTML || full.Text).match(/href="([^"]+)"/)[1].replace(/&amp;/g, "&");
    }
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  throw new Error(`no email matching ${subject} for ${email}`);
}

async function logIn(page, password) {
  await page.goto(BASE + "/login");
  await vis(page.getByLabel("Email")).fill(owner);
  await vis(page.getByLabel("Password")).fill(password);
  await vis(page.getByRole("button", { name: "Log in" })).click();
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

  // 1. Sign up a plain shop: both questions left unticked.
  await a.goto(BASE + "/signup");
  await a.getByLabel("Your full name").fill("Tola Ade");
  await a.getByLabel("Email", { exact: true }).fill(owner);
  await a.getByLabel("Password").fill(OLD_PASSWORD);
  await a.getByRole("button", { name: "Create account" }).click();
  await a.getByText(`We sent a confirmation link to ${owner}`).waitFor();
  await a.goto(await emailLink(owner, /confirm/i));
  await a.waitForURL("**/onboarding");
  await a.getByText("How do you sell?").waitFor();
  // The follow-up questions only appear once the first choice is made.
  assert.equal(await a.getByLabel("Customers bring things back to me").count(), 0);
  await a.getByText("I count my goods").click();
  assert.equal(await a.getByLabel("I sell drinks (RGB crates and PET packs)").isChecked(), false);
  assert.equal(await a.getByLabel("I also sell some items with serial numbers").isChecked(), false);
  assert.equal(await a.getByLabel("We deliver to customers").isChecked(), true, "a goods business delivers by default");
  await a.screenshot({ path: `${SHOTS}/80-onboarding-questions.png`, fullPage: true });
  await a.getByLabel("Business name").fill(`Tola Foods ${run}`);
  await a.getByRole("button", { name: "Create business" }).click();
  await a.waitForURL(/\/b\/tola-foods-/);
  const base = new URL(a.url()).pathname;
  const slug = base.split("/")[2];
  const go = (path) => a.goto(BASE + base + path);

  await menu(a).getByRole("link", { name: "Orders", exact: true }).waitFor();
  assert.equal(await menu(a).getByRole("link", { name: "Returns", exact: true }).count(), 0);
  await go("/products/new");
  await vis(a.getByLabel("Product name")).fill("Rice 50kg");
  assert.equal(await a.getByLabel("Customers must bring something back").count(), 0);
  assert.equal(await a.getByLabel("Track each unit by serial number").count(), 0);
  await vis(a.getByLabel("Sold by the")).fill("bag");
  await vis(a.getByLabel(/Selling price/)).fill("78000");
  await vis(a.getByRole("button", { name: "Save product" })).click();
  await a.waitForURL(new RegExp(base + "/products$"));
  await go("/stock");
  assert.equal(await a.getByLabel("Find a serial number").count(), 0);
  ok("a shop that said no to both questions sees no Returns page, no return or serial fields, no serial search");

  // 2. Write-offs and corrections
  await go("/stock/receive");
  await pick(a, "Product", "Rice 50kg");
  await vis(a.getByLabel("Quantity")).fill("20");
  await vis(a.getByRole("button", { name: "Save and add to stock" })).click();
  await a.waitForURL(/\/stock\/receipts\//);
  await go("/stock");
  await a.getByRole("link", { name: "Write off / correct" }).click();
  await a.waitForURL(/\/stock\/adjust$/);
  await pick(a, "Product", "Rice 50kg");
  await a.getByText("20 bag in stock here.").waitFor();
  await vis(a.getByLabel("Reason")).selectOption({ label: "Damaged" });
  await vis(a.getByLabel("Quantity")).fill("50");
  await vis(a.getByRole("button", { name: "Take out of stock" })).click();
  await a.getByText("Only 20 of Rice 50kg is in stock here, so 50 cannot be taken out.").waitFor();
  await vis(a.getByLabel("Quantity")).fill("3");
  await vis(a.getByLabel("Note (optional)")).fill("Rain got in");
  await a.screenshot({ path: `${SHOTS}/81-write-off.png`, fullPage: true });
  await vis(a.getByRole("button", { name: "Take out of stock" })).click();
  await a.waitForURL(/\/stock\/adjust\?saved=1/);
  await a.getByText("Stock updated.").waitFor();
  const recent = a.locator("section", { hasText: "Recent changes" });
  await recent.getByText("Rice 50kg: Damaged").waitFor();
  await recent.getByText("−3 bag").waitFor();

  // Adding back: "found" needs no note, a count correction does.
  await a.getByText("+ Add", { exact: true }).click();
  await pick(a, "Product", "Rice 50kg");
  await vis(a.getByLabel("Reason")).selectOption({ label: "The count was wrong" });
  await vis(a.getByLabel("Quantity")).fill("2");
  assert.equal(await vis(a.getByLabel("Why is the count being corrected?")).getAttribute("required"), "");
  await vis(a.getByLabel("Reason")).selectOption({ label: "Found stock" });
  await vis(a.getByRole("button", { name: "Add to stock" })).click();
  await a.waitForURL(/\/stock\/adjust\?saved=1/);
  await recent.getByText("+2 bag").waitFor();
  await go("/stock");
  await a.locator("li", { hasText: "Rice 50kg" }).getByText("19", { exact: true }).waitFor();
  ok("stock is written off with a reason, can't go below what is there, and found stock is added back");

  // Voiding the damaged write-off puts the 3 bags back.
  await go("/stock/adjust");
  const damaged = recent.locator("li", { hasText: "Rice 50kg: Damaged" });
  await damaged.getByText("Void this change").click();
  await damaged.getByLabel("Reason").fill("Bags were fine after drying");
  await damaged.getByRole("button", { name: "Void change" }).click();
  await damaged.getByText("Voided", { exact: true }).waitFor();
  await go("/stock");
  await a.locator("li", { hasText: "Rice 50kg" }).getByText("22", { exact: true }).waitFor();
  await go("/reports/daily");
  const riceRow = a.locator("section", { hasText: "Stock" }).first().locator("tr", { hasText: "Rice 50kg" });
  assert.deepEqual((await riceRow.locator("td").allInnerTexts()).map((t) => t.trim()), ["0", "20", "0", "+2", "22"]);
  await go("/activity");
  await a.locator("li", { hasText: "Voided a stock adjustment" }).waitFor();
  ok("voiding a write-off restores the stock; the daily report and activity log show the changes");

  // 3. Search and paging, with enough customers to need a second page.
  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY);
  const signIn = await supabase.auth.signInWithPassword({ email: owner, password: OLD_PASSWORD });
  assert.ifError(signIn.error);
  const { data: org } = await supabase.from("organizations").select("id").eq("slug", slug).single();
  for (let i = 1; i <= 54; i++) {
    const { error } = await supabase.rpc("save_customer", {
      p_organization_id: org.id,
      p_customer_id: null,
      p_name: `Shop ${String(i).padStart(2, "0")}`,
      p_phone: `0803 000 ${String(1000 + i)}`,
      p_area: i % 2 ? "Ikeja" : "Yaba",
      p_address: null
    });
    assert.ifError(error);
  }
  await supabase.rpc("save_customer", {
    p_organization_id: org.id, p_customer_id: null, p_name: "Iya Basira Provisions", p_phone: "0812 555 0101", p_area: "Surulere", p_address: null
  });
  await go("/customers");
  await a.getByText("Showing 1–50 of 55").waitFor();
  await a.getByRole("link", { name: "Next →" }).click();
  await a.waitForURL(/\/customers\?page=2/);
  await a.getByText("Showing 51–55 of 55").waitFor();
  assert.equal(await a.getByRole("link", { name: "Next →" }).count(), 0);
  await a.getByRole("link", { name: "← Previous" }).waitFor();
  await a.getByRole("searchbox").fill("basira");
  await a.getByRole("button", { name: "Search" }).click();
  await a.waitForURL(/\/customers\?q=basira/);
  await a.getByText("Iya Basira Provisions").waitFor();
  assert.equal(await a.getByText(/^Shop \d\d$/).count(), 0);
  await a.getByRole("searchbox").fill("0812 555");
  await a.getByRole("button", { name: "Search" }).click();
  await a.getByText("Iya Basira Provisions").waitFor();
  await a.getByRole("searchbox").fill("Yaba");
  await a.getByRole("button", { name: "Search" }).click();
  await a.getByText("Shop 02").waitFor();
  assert.equal(await a.getByText("Shop 01", { exact: true }).count(), 0);
  // Characters that mean something to the database filter are harmless.
  await go("/customers?q=" + encodeURIComponent("zq,x)%_*"));
  await a.getByText(/Nothing matches/).waitFor();
  await a.getByRole("link", { name: "Show everything" }).click();
  await a.getByText("Showing 1–50 of 55").waitFor();
  await a.screenshot({ path: `${SHOTS}/82-customers-paged.png`, fullPage: true });

  // Orders: search by customer and by number.
  await go("/orders/new");
  await pick(a, "Customer", "Iya Basira Provisions");
  await pick(a, "Product", "Rice 50kg");
  await vis(a.getByLabel("Quantity")).fill("2");
  await vis(a.getByRole("button", { name: "Save order" })).click();
  await a.waitForURL(/\/orders\/[0-9a-f-]{36}\?saved=1/);
  await go("/orders?q=basira");
  await a.locator("section", { hasText: "Orders matching “basira”" }).getByText("Iya Basira Provisions").waitFor();
  await go("/orders?q=nobody-here");
  await a.getByText("Nothing matches “nobody-here”.").waitFor();
  await go("/products?q=rice");
  await a.getByText("Rice 50kg").waitFor();
  await go("/stock/receipts?q=STK");
  await a.locator("section", { hasText: "Deliveries matching" }).getByText(/^STK-/).first().waitFor();
  ok("customers page in fifties; orders, customers, products and deliveries can be searched");

  // 4. Switching serial numbers on later, and a serial write-off.
  await go("/settings");
  const features = a.locator("form", { has: a.getByText("How do you sell?") });
  await features.getByLabel("I also sell some items with serial numbers").check();
  await features.getByRole("button", { name: "Save" }).click();
  await features.getByText("Saved. The menus and forms now match what you sell.").waitFor();
  await go("/products/new");
  await vis(a.getByLabel("Product name")).fill("Infinix Hot 40");
  await vis(a.getByLabel("Sold by the")).fill("phone");
  await vis(a.getByLabel(/Selling price/)).fill("185000");
  await vis(a.getByLabel("Track each unit by serial number")).check();
  await vis(a.getByRole("button", { name: "Save product" })).click();
  await a.waitForURL(new RegExp(base + "/products$"));
  await go("/stock/receive");
  await pick(a, "Product", "Infinix Hot 40");
  await vis(a.getByLabel("Serial / IMEI 1")).fill("861234560000011");
  await vis(a.getByLabel("Serial / IMEI 1")).press("Enter");
  await vis(a.getByLabel("Serial / IMEI 2")).fill("861234560000022");
  await vis(a.getByRole("button", { name: "Save and add to stock" })).click();
  await a.waitForURL(/\/stock\/receipts\//);

  await go("/stock/adjust");
  await pick(a, "Product", "Infinix Hot 40");
  await vis(a.getByLabel("Reason")).selectOption({ label: "Lost or stolen" });
  await a.getByText("Serial number of each phone taken out (0 chosen)").waitFor();
  await a.locator("label", { hasText: "861234560000022" }).click();
  await vis(a.getByRole("button", { name: "Take out of stock" })).click();
  await a.waitForURL(/\/stock\/adjust\?saved=1/);
  await recent.getByText("861234560000022").waitFor();
  // Serial-numbered stock only comes in through a delivery.
  await a.getByText("+ Add", { exact: true }).click();
  const box = a.getByRole("combobox", { name: "Product", exact: true });
  await box.click();
  await box.fill("Infinix");
  assert.equal(await a.getByRole("option", { name: /Infinix Hot 40/ }).getAttribute("aria-disabled"), "true");
  await go("/stock/serials?q=0000022");
  const unit = a.locator("section", { hasText: "861234560000022" });
  await unit.getByText("Written off", { exact: true }).first().waitFor();
  await unit.getByText("Lost or stolen").waitFor();
  await go("/settings");
  await features.getByLabel("I also sell some items with serial numbers").uncheck();
  await features.getByRole("button", { name: "Save" }).click();
  await features
    .getByText("Serial numbers cannot be switched off while Infinix Hot 40 is tracked by serial number.", { exact: false })
    .waitFor();
  ok("serial numbers can be switched on later; a lost phone is written off by its serial and shows so in the lookup");

  // 5. Forgot password
  await vis(a.getByRole("button", { name: "Log out" })).click();
  await a.waitForURL("**/login");
  await a.goto(BASE + "/reset-password");
  await a.getByRole("heading", { name: "Link expired" }).waitFor();
  await a.goto(BASE + "/auth/confirm?code=bogus&next=%2Freset-password");
  await a.waitForURL(/\/forgot-password\?expired=1/);
  await a.getByText("That reset link has expired or was already used.").waitFor();
  await a.goto(BASE + "/login");
  await vis(a.getByRole("link", { name: "Forgot your password?" })).click();
  await a.waitForURL("**/forgot-password");
  // An unknown email gets the same answer, so the form gives nothing away.
  await vis(a.getByLabel("Email")).fill(`nobody-${run}@example.com`);
  await vis(a.getByRole("button", { name: "Send reset link" })).click();
  await a.getByText(`If nobody-${run}@example.com has a BukAm account`).waitFor();
  await vis(a.getByLabel("Email")).fill(owner);
  await vis(a.getByRole("button", { name: "Send reset link" })).click();
  await a.getByText(`If ${owner} has a BukAm account, a link to choose a new password is on its way.`).waitFor();
  await a.screenshot({ path: `${SHOTS}/83-forgot-password.png`, fullPage: true });
  await a.goto(await emailLink(owner, /reset/i));
  await a.waitForURL("**/reset-password");
  await a.getByRole("heading", { name: "Choose a new password" }).waitFor();
  await vis(a.getByLabel("New password")).fill(NEW_PASSWORD);
  await vis(a.getByLabel("Type it again")).fill("something-else-1");
  await vis(a.getByRole("button", { name: "Save new password" })).click();
  await a.getByText("The two passwords do not match.").waitFor();
  await vis(a.getByLabel("Type it again")).fill(NEW_PASSWORD);
  await vis(a.getByRole("button", { name: "Save new password" })).click();
  await a.waitForURL(new RegExp(base + "$"));
  await vis(a.getByRole("button", { name: "Log out" })).click();
  await a.waitForURL("**/login");
  await logIn(a, OLD_PASSWORD);
  await a.getByText("That email or password is not correct.").waitFor();
  await logIn(a, NEW_PASSWORD);
  await a.waitForURL(new RegExp(base + "$"));
  ok("forgot password: the emailed link lets the owner choose a new one, and the old one stops working");

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
