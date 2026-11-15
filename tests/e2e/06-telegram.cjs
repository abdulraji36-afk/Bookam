const { chromium } = require("playwright");
const { pick } = require("./helpers.cjs");
const assert = require("node:assert/strict");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const TG = process.env.E2E_TELEGRAM_MOCK_URL ?? "http://127.0.0.1:8099";
const SHOTS = process.argv[2] ?? require("node:os").tmpdir();
const run = Date.now().toString(36);
const ada = `ada6-${run}@example.com`;
let passed = 0;
const ok = (name) => { passed++; console.log("PASS", name); };
const MAIL = `${process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324"}/api/v1`;
const vis = (locator) => locator.filter({ visible: true });
const CHAT = -1001234500000 - Math.floor(Math.random() * 100000);

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
const sent = async () => (await (await fetch(TG + "/messages")).json()).filter((m) => m.chat_id === CHAT);
async function waitForMessage(pattern) {
  for (let i = 0; i < 40; i++) {
    const found = (await sent()).find((m) => pattern.test(m.text));
    if (found) return found.text;
    await new Promise((r) => setTimeout(r, 250));
  }
  throw new Error("no Telegram message matching " + pattern + "; got: " + JSON.stringify((await sent()).map((m) => m.text)));
}
const webhook = (text, secret = "test-secret") =>
  fetch(BASE + "/api/telegram/webhook", {
    method: "POST",
    headers: { "content-type": "application/json", "x-telegram-bot-api-secret-token": secret },
    body: JSON.stringify({ update_id: 1, message: { message_id: 1, chat: { id: CHAT, type: "supergroup", title: "Ada Depot Staff" }, text } })
  });

let dbg;
(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const a = await (await browser.newContext({ viewport: { width: 1280, height: 800 } })).newPage();
  dbg = a;
  a.on("pageerror", (e) => errors.push(String(e)));
  a.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });

  await a.goto(BASE + "/signup");
  await a.getByLabel("Your full name").fill("Ada Obi");
  await a.getByLabel("Email", { exact: true }).fill(ada);
  await a.getByLabel("Password").fill("correct-horse-9");
  await a.getByRole("button", { name: "Create account" }).click();
  await a.getByText(`We sent a confirmation link to ${ada}`).waitFor();
  await a.goto(await confirmationLink(ada));
  await a.waitForURL("**/onboarding");
  await a.getByLabel("Business name").fill(`Ada Drinks ${run}`);
  await a.getByText("I count my goods").click();
  await a.getByRole("button", { name: "Create business" }).click();
  await a.waitForURL(/\/b\/ada-drinks-/);
  const base = new URL(a.url()).pathname;
  const go = (path) => a.goto(BASE + base + path);

  await go("/products/new");
  await vis(a.getByLabel("Product name")).fill("Water 75cl");
  await vis(a.getByLabel("Sold by the", { exact: true })).fill("pack");
  await vis(a.getByLabel(/Selling price/)).fill("1800");
  await vis(a.getByRole("button", { name: "Save product" })).click();
  await a.waitForURL(new RegExp(base + "/products$"));
  await go("/customers/new");
  await vis(a.getByLabel("Customer name")).fill("Mama Tunde Stores");
  await vis(a.getByRole("button", { name: "Save customer" })).click();
  await a.waitForURL(new RegExp(base + "/customers$"));
  async function receive(quantity) {
    await go("/stock/receive");
    await pick(a, "Product", "Water 75cl (pack)");
    await vis(a.getByLabel("Quantity")).fill(String(quantity));
    await vis(a.getByRole("button", { name: "Save and add to stock" })).click();
    await a.waitForURL(/\/stock\/receipts\//);
  }
  async function order(quantity) {
    await go("/orders/new");
    await pick(a, "Customer", "Mama Tunde Stores");
    await pick(a, "Product", "Water 75cl");
    await vis(a.getByLabel("Quantity")).fill(String(quantity));
    await vis(a.getByRole("button", { name: "Save order" })).click();
    await a.waitForURL(/\/orders\/[0-9a-f-]{36}\?saved=1/);
  }
  await receive(50);
  assert.equal((await sent()).length, 0, "nothing is sent before a chat is linked");
  ok("set-up done; nothing is sent while Telegram is not connected");

  // Connect
  await go("/settings");
  const card = a.locator("section", { hasText: "Telegram notifications" });
  await card.getByRole("button", { name: "Connect Telegram" }).click();
  const groupLink = await card.getByRole("link", { name: "Add to a group" }).getAttribute("href");
  assert.match(groupLink, /^https:\/\/t\.me\/bookam_test_bot\?startgroup=[0-9a-f]{32}$/);
  const command = await card.locator("code").innerText();
  await a.screenshot({ path: `${SHOTS}/50-telegram-connect.png`, fullPage: true });

  assert.equal((await webhook(command, "wrong-secret")).status, 401);
  assert.equal((await webhook("/start")).status, 200);
  await waitForMessage(/open the link on the Settings page/);
  assert.equal((await webhook("/start@bookam_test_bot " + "0".repeat(32))).status, 200);
  await waitForMessage(/expired or was already used/);
  assert.equal((await webhook(command)).status, 200);
  await waitForMessage(new RegExp(`Connected to Ada Drinks ${run}`));
  await card.getByRole("button", { name: "Check connection" }).click();
  await card.getByText("Connected to Ada Depot Staff.").waitFor();
  await a.screenshot({ path: `${SHOTS}/51-telegram-connected.png`, fullPage: true });
  ok("a business links its own Telegram chat with a one-time code; wrong secrets and codes are refused");

  await card.getByRole("button", { name: "Send a test message" }).click();
  await card.getByText("Test message sent. Check your Telegram chat.").waitFor();
  await waitForMessage(/This is a test message from BukAm/);
  ok("a test message reaches the linked chat");

  await order(5);
  const orderText = await waitForMessage(/New order ORD-\d{8}-0001/);
  assert.match(orderText, new RegExp(`^Ada Drinks ${run}\\nNew order ORD-\\d{8}-0001\\nMama Tunde Stores: 5 items, ₦9,000\\nBy Ada Obi$`));
  await receive(10);
  await waitForMessage(/Stock received STK-\d{8}-0002\n1 product, 10 items in total/);
  ok("recording an order and receiving stock each post a message signed with who did it");

  // Pause
  await go("/settings");
  await card.getByRole("button", { name: "Pause" }).click();
  await card.getByText("Paused", { exact: true }).waitFor();
  const before = (await sent()).length;
  await order(2);
  await new Promise((r) => setTimeout(r, 2500));
  assert.equal((await sent()).length, before, "nothing is sent while paused");
  await go("/settings");
  await card.getByRole("button", { name: "Resume" }).click();
  await card.getByText("On", { exact: true }).waitFor();
  await order(1);
  await waitForMessage(/New order ORD-\d{8}-0003/);
  ok("pausing stops messages and resuming starts them again");

  // Disconnect
  await go("/settings");
  await card.getByRole("button", { name: "Disconnect" }).click();
  await a.getByRole("button", { name: /^Yes, / }).click();
  await card.getByRole("button", { name: "Connect Telegram" }).waitFor();
  const after = (await sent()).length;
  await order(1);
  await new Promise((r) => setTimeout(r, 2500));
  assert.equal((await sent()).length, after, "nothing is sent after disconnecting");
  await go("/activity");
  await a.locator("li, tr", { hasText: "Connected Telegram" }).getByText("Ada Depot Staff").waitFor();
  await a.locator("li, tr", { hasText: "Disconnected Telegram" }).waitFor();
  ok("disconnecting stops messages, and the activity log records both");

  await browser.close();
  const real = errors.filter((e) => !/404|401|Failed to load resource/.test(e));
  console.log("browser errors:", real.length ? real : "none");
  console.log(`${passed} steps passed`);
  if (real.length) process.exit(1);
})().catch(async (e) => { try { await dbg.screenshot({ path: SHOTS + "/fail.png", fullPage: true }); console.error("URL", dbg.url()); } catch {} console.error("FAIL", e.message.split("\n").slice(0, 14).join("\n")); process.exit(1); });
