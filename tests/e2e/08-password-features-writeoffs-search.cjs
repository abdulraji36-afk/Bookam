// Iteration 8: forgot password, the sign-up questions, stock write-offs, and
// search with paging on long lists.
const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const { createClient } = require("@supabase/supabase-js");
const { pick, receiveCards, newOrders } = require("./helpers.cjs");
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
  // First the workspace: Drinks depot, or another kind of business.
  await a.getByText("Choose your workspace").waitFor();
  assert.equal(await a.getByText("How do you sell?").count(), 0);
  await a.getByText("Another kind of business").click();
  await a.getByText("How do you sell?").waitFor();
  // The follow-up questions only appear once the first choice is made.
  assert.equal(await a.getByLabel("Customers bring things back to me").count(), 0);
  await a.getByText("I count my goods").click();
  // Drinks is its own workspace, so it is not asked again here.
  assert.equal(await a.getByLabel("I sell drinks (RGB crates and PET packs)").count(), 0);
  // A goods business is asked whether anything comes back, not about serial numbers.
  assert.equal(await a.getByLabel("I also sell some items with serial numbers").count(), 0);
  assert.equal(await a.getByLabel("Customers bring things back to me").isChecked(), false);
  assert.equal(await a.getByLabel("What do they bring back?").count(), 0, "only asked once something comes back");
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
  assert.equal(await menu(a).getByRole("link", { name: "Returnables", exact: true }).count(), 0);
  assert.equal(await menu(a).getByRole("link", { name: "Return shortages", exact: true }).count(), 0);
  await go("/products/new");
  await vis(a.getByLabel("Product name")).fill("Rice 50kg");
  assert.equal(await a.getByLabel("Customers must bring something back").count(), 0);
  assert.equal(await a.getByLabel("Track each unit by serial number").count(), 0);
  // Nothing comes back here, so there is no Returnable choice: only the category.
  assert.equal(await a.getByText("Does anything come back with it?").count(), 0);
  await vis(a.getByLabel("Sold by the", { exact: true })).fill("bag");
  await vis(a.getByLabel(/Selling price/)).fill("78000");
  await vis(a.getByLabel(/Buying cost/)).fill("72000");
  await vis(a.getByLabel("Category")).fill("Grains");
  await vis(a.getByRole("button", { name: "Save product" })).click();
  await a.waitForURL(new RegExp(base + "/products$"));
  await go("/stock/summary");
  assert.equal(await a.getByLabel("Find a serial number").count(), 0);
  ok("a shop that said no to both questions sees no Returns page, no return or serial fields, no serial search");

  // 2. No write-offs: stock only comes in through deliveries (and goes out on orders).
  await go("/stock/receive");
  await receiveCards(a, [["Rice 50kg", 20]]);
  await vis(a.getByLabel("Supplier delivery reference")).fill("WB-001");
  await vis(a.getByRole("button", { name: "Save and add to stock" })).click();
  await a.waitForURL(/\/stock\/receipts\//);
  await go("/stock/summary");
  await a.locator("li, tr", { hasText: "Rice 50kg" }).locator("[data-current-stock]").getByText("20", { exact: true }).waitFor();
  assert.equal(await a.getByRole("link", { name: "Write off / correct" }).count(), 0);
  const gone = await a.goto(BASE + base + "/stock/adjust");
  assert.equal(gone.status(), 404);
  await go("/reports/daily");
  const riceRow = a.locator("section", { hasText: "Product movement on" }).locator("tr", { hasText: "Rice 50kg" });
  assert.deepEqual((await riceRow.locator("td").allInnerTexts()).map((t) => t.trim()).slice(4), ["0", "20", "0", "20"]);
  ok("there is no write-off screen; stock comes in through deliveries and the report has no write-off column");

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

  // Orders: the depot order screen (several customers at once), then search.
  await newOrders(a, BASE + base, "pet", [{ customer: "Iya Basira Provisions", lines: [["Rice 50kg", 2]] }]);
  await go("/orders?q=basira");
  await a.locator("tr", { hasText: "Iya Basira Provisions" }).first().waitFor();
  await go("/orders?q=nobody-here");
  await a.getByText("Nothing matches “nobody-here”.").waitFor();
  await go("/products?q=rice");
  await a.getByText("Rice 50kg").waitFor();
  await go("/stock/receipts?q=STK");
  await a.locator("tr").getByText(/^STK-/).first().waitFor();
  ok("customers page in fifties; orders, customers, products and deliveries can be searched");

  // 4. Settings: something starts coming back later, with its own name.
  await go("/settings");
  await vis(a.getByLabel("Customers bring things back to me")).check();
  await vis(a.getByLabel("What do they bring back?")).fill("Empty sacks");
  await vis(a.getByRole("button", { name: "Save", exact: true })).last().click();
  await a.getByText("Saved. The menus and forms now match what you sell.").waitFor();
  await go("");
  await menu(a).getByRole("link", { name: "Empty sacks", exact: true }).waitFor();
  await menu(a).getByRole("link", { name: "Return shortages", exact: true }).waitFor();
  // A product can now be Returnable.
  await go("/products/new");
  await a.getByText("Does anything come back with it?").waitFor();
  await vis(a.getByLabel(/^Returnable/)).waitFor();
  // And it can be switched off again while nothing returnable is in use.
  await go("/settings");
  await vis(a.getByLabel("Customers bring things back to me")).uncheck();
  await vis(a.getByRole("button", { name: "Save", exact: true })).last().click();
  await a.getByText("Saved. The menus and forms now match what you sell.").waitFor();
  await go("");
  assert.equal(await menu(a).getByRole("link", { name: "Empty sacks", exact: true }).count(), 0);
  ok("a goods business names what comes back in Settings, and can switch it off again")

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
