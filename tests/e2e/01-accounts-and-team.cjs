const { chromium } = require("playwright");
const assert = require("node:assert/strict");
const BASE = process.env.E2E_BASE_URL ?? "http://localhost:3000";
const SHOTS = process.argv[2] ?? require("node:os").tmpdir();
const run = Date.now().toString(36);
const ada = `ada-${run}@example.com`, chidi = `chidi-${run}@example.com`, bola = `bola-${run}@example.com`;
const steps = [];
const ok = (name) => { steps.push(name); console.log("PASS", name); };

const MAIL = `${process.env.E2E_MAILPIT_URL ?? "http://127.0.0.1:54324"}/api/v1`;
async function confirmationLink(email) {
  for (let i = 0; i < 20; i++) {
    const found = await (await fetch(`${MAIL}/search?query=${encodeURIComponent("to:" + email)}`)).json();
    if (found.messages?.length) {
      const message = await (await fetch(`${MAIL}/message/${found.messages[0].ID}`)).json();
      const match = (message.HTML || message.Text).match(/href="([^"]+)"/);
      return match[1].replace(/&amp;/g, "&");
    }
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error("no confirmation email for " + email);
}

async function signUp(page, name, email, expectUrl) {
  await page.getByLabel("Your full name").fill(name);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-9");
  await page.getByRole("button", { name: "Create account" }).click();
  await page.getByText(`We sent a confirmation link to ${email}`).waitFor();
  // Not confirmed yet: logging in must be refused.
  await page.goto(BASE + "/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill("correct-horse-9");
  await page.getByRole("button", { name: "Log in" }).click();
  await page.getByText("Confirm your email first.").waitFor();
  await page.goto(await confirmationLink(email));
  await page.waitForURL(expectUrl);
}

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  const newPage = async (viewport) => {
    const ctx = await browser.newContext({ viewport: viewport ?? { width: 1280, height: 800 } });
    const page = await ctx.newPage();
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
    return page;
  };

  // 1. Landing + protected redirect
  const a = await newPage();
  await a.goto(BASE + "/");
  await a.getByRole("heading", { level: 1 }).waitFor();
  await a.screenshot({ path: `${SHOTS}/01-landing.png` });
  await a.goto(BASE + "/b/ada-drinks/team");
  await a.waitForURL(/\/login\?next=%2Fb%2Fada-drinks%2Fteam/);
  ok("signed-out visitor is sent to login");
  await a.goto(BASE + "/auth/confirm?code=bogus");
  await a.getByText("That confirmation link has expired or was already used.").waitFor();
  ok("a bad confirmation link shows a clear message");

  // 2. Owner signs up and creates a business
  await a.goto(BASE + "/signup");
  await signUp(a, "Ada Obi", ada, "**/onboarding");
  await a.getByLabel("Business name").fill(`Ada Drinks ${run}`);
  await a.getByLabel("What kind of business is it?").selectOption("Drinks depot");
  await a.getByRole("button", { name: "Create business" }).click();
  await a.waitForURL(/\/b\/ada-drinks-/);
  const base = new URL(a.url()).pathname;
  await a.getByRole("heading", { name: "Welcome, Ada" }).waitFor();
  await a.getByText("Free trial: 14 days left.").waitFor();
  await a.screenshot({ path: `${SHOTS}/02-dashboard.png` });
  ok("owner signs up, creates a business, lands on its dashboard with a 14-day trial (email confirmed via the emailed link)");

  // 3. Settings: rename + add location
  await a.getByRole("link", { name: "Settings" }).click();
  await a.getByRole("heading", { name: "Settings" }).waitFor();
  await a.getByLabel("New location name").fill("Ikeja warehouse");
  await a.getByRole("button", { name: "Add location" }).click();
  await a.getByText("Ikeja warehouse added.").waitFor();
  assert.equal(await a.getByLabel("New location name").inputValue(), "", "field cleared after success");
  await a.locator("li", { hasText: "Ikeja warehouse" }).waitFor();
  await a.getByLabel("New location name").fill("ikeja warehouse");
  await a.getByRole("button", { name: "Add location" }).click();
  await a.getByText("A location with this name already exists.").waitFor();
  assert.equal(await a.getByLabel("New location name").inputValue(), "ikeja warehouse", "typed value kept on error");
  await a.screenshot({ path: `${SHOTS}/03-settings.png`, fullPage: true });
  ok("owner adds a location; duplicate name is refused with a clear message");

  // 4. Team: invite staff
  await a.getByRole("link", { name: "Team" }).click();
  await a.getByRole("heading", { name: "Team", exact: true }).waitFor();
  await a.getByLabel("Email address").fill(chidi);
  await a.getByRole("button", { name: "Create invite" }).click();
  const link = await a.getByLabel("Invitation link").inputValue();
  assert.ok(link.startsWith(`${BASE}/invite/`) && /\/invite\/[0-9a-f]{64}$/.test(link), link);
  await a.locator("li", { hasText: chidi }).waitFor();
  await a.screenshot({ path: `${SHOTS}/04-team-invite.png`, fullPage: true });
  ok("owner creates an invite link and it shows under open invitations");

  // 5. Invitee opens the link, signs up, accepts
  const c = await newPage({ width: 390, height: 844 });
  await c.goto(link);
  await c.getByRole("heading", { name: /Join Ada Drinks/ }).waitFor();
  await c.screenshot({ path: `${SHOTS}/05-invite-mobile.png` });
  await c.getByRole("link", { name: "Create an account to join" }).click();
  await c.waitForURL(/\/signup/);
  assert.equal(await c.getByLabel("Email").inputValue(), chidi);
  await signUp(c, "Chidi Eze", chidi, /\/invite\//);
  await c.getByRole("button", { name: "Accept invitation" }).click();
  await c.waitForURL(new RegExp(base + "$"));
  await c.getByText(/· Staff$/).waitFor();
  // On a phone the less-used pages are under "More"; staff must not find Team there.
  await c.getByRole("button", { name: "More" }).click();
  await c.getByRole("link", { name: "Customers", exact: true }).waitFor();
  assert.equal(await c.getByRole("link", { name: "Team", exact: true }).count(), 0);
  await c.getByRole("button", { name: "Close" }).click();
  await c.screenshot({ path: `${SHOTS}/06-staff-dashboard-mobile.png` });
  await c.goto(BASE + base + "/team");
  await c.waitForURL(new RegExp(base + "$"));
  await c.goto(link);
  await c.getByText("This invitation has already been used.").waitFor();
  ok("invitee signs up from the link, joins as Staff, cannot open Team, link cannot be reused");

  // 6. A different business cannot see this one
  const b = await newPage();
  await b.goto(BASE + "/signup");
  await signUp(b, "Bola Ade", bola, "**/onboarding");
  await b.getByLabel("Business name").fill(`Bola Gas ${run}`);
  await b.getByRole("button", { name: "Create business" }).click();
  await b.waitForURL(/\/b\/bola-gas-/);
  await b.goto(BASE + base);
  await b.getByRole("heading", { name: "We could not find that page" }).waitFor();
  assert.equal(await b.getByText("Ada Drinks").count(), 0);
  await b.goto(BASE + base + "/team");
  await b.getByRole("heading", { name: "We could not find that page" }).waitFor();
  ok("another business's owner gets Not Found for this business");

  // 7. Owner manages the new member
  await a.reload();
  const row = a.locator("li", { hasText: "Chidi Eze" });
  await row.waitFor();
  await row.getByLabel("Role for Chidi Eze").selectOption("admin");
  await a.waitForTimeout(800);
  await a.reload();
  assert.equal(await a.locator("li", { hasText: "Chidi Eze" }).getByLabel("Role for Chidi Eze").inputValue(), "admin");
  await c.goto(BASE + base);
  await c.getByRole("button", { name: "More" }).click();
  await c.getByRole("link", { name: "Team", exact: true }).waitFor();
  ok("owner promotes the member to Admin and they gain the Team page");

  await a.locator("li", { hasText: "Chidi Eze" }).getByRole("button", { name: "Remove access" }).click();
  await a.getByRole("button", { name: /^Yes, / }).click();
  await a.locator("li", { hasText: "Chidi Eze" }).getByText("Access removed").waitFor();
  await a.screenshot({ path: `${SHOTS}/07-team-removed.png`, fullPage: true });
  await c.goto(BASE + base);
  await c.getByRole("heading", { name: "We could not find that page" }).waitFor();
  ok("owner removes access and the member is locked out on their next page load");

  // 8. Log out / log in
  await a.getByRole("button", { name: "Log out" }).click();
  await a.waitForURL("**/login");
  assert.equal(await a.locator("main").count(), 1, "no earlier pages left in the DOM after logout");
  assert.equal(await a.getByText(chidi).count(), 0, "previous user's data is gone after logout");
  await a.getByLabel("Email").fill(ada);
  await a.getByLabel("Password").fill("wrong-password");
  await a.getByRole("button", { name: "Log in" }).click();
  await a.getByText("That email or password is not correct.").waitFor();
  assert.equal(await a.getByLabel("Email").inputValue(), ada, "email is kept after a failed login");
  await a.getByLabel("Password").fill("correct-horse-9");
  await a.getByRole("button", { name: "Log in" }).click();
  await a.waitForURL(new RegExp(base + "$"));
  ok("wrong password is refused; correct password returns the owner to their business");

  // 9. Open redirect guard
  await a.getByRole("button", { name: "Log out" }).click();
  await a.waitForURL("**/login");
  await a.goto(BASE + "/login?next=https://evil.example");
  await a.getByLabel("Email").fill(ada);
  await a.getByLabel("Password").fill("correct-horse-9");
  await a.getByRole("button", { name: "Log in" }).click();
  await a.waitForURL(new RegExp(base + "$"));
  ok("a login link pointing at another website is ignored");

  await browser.close();
  const real = errors.filter((e) => !/404|Failed to load resource/.test(e));
  console.log("browser errors:", real.length ? real : "none");
  console.log(`${steps.length} steps passed`);
  if (real.length) process.exit(1);
})().catch((e) => { console.error("FAIL", e.message.split("\n").slice(0, 12).join("\n")); process.exit(1); });
