// Shared by the walkthroughs: choosing from a searchable picker.
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Types into the picker labelled `label` and chooses the first entry matching `text`. */
async function pick(scope, label, text) {
  const box = scope
    .getByRole("combobox", { name: label, exact: true })
    .filter({ visible: true });
  const wanted = text.replace(/\s*\(.*$/, ""); // "Cola 50cl (crate)" -> "Cola 50cl"
  await box.click();
  await box.fill(wanted);
  await scope
    .getByRole("option", { name: new RegExp(escape(wanted)) })
    .first()
    .click();
}

/**
 * Adds drivers and workers on the business's Drivers & workers page. A trip
 * can only take its driver and workers from that list.
 */
async function addCrew(page, businessUrl, drivers, workers = ["Sule"]) {
  const vis = (locator) => locator.filter({ visible: true });
  await page.goto(businessUrl + "/dispatch/crew");
  for (const [name, role] of [
    ...drivers.map((n) => [n, "Driver"]),
    ...workers.map((n) => [n, "Worker"]),
  ]) {
    await vis(page.getByLabel("Name", { exact: true })).fill(name);
    await vis(page.getByLabel("Driver or worker?")).selectOption({
      label: role,
    });
    await vis(page.getByRole("button", { name: "Add to the list" })).click();
    await page.getByText(`${name} added.`).waitFor();
  }
}

/**
 * Fills the New order page of a drinks business (several customers on one
 * page, with RGB and PET tabs) and saves it.
 *
 *   rows: [{ customer: "Mama Tunde Stores", lines: [["Cola 50cl", 40]] }, ...]
 *
 * Gives back the ids of the orders saved, in the order of the rows. Pass
 * `beforeSave` to look at the filled page first, or `save: false` to stop
 * before saving.
 */
async function newOrders(page, businessUrl, kind, rows, options = {}) {
  const vis = (locator) => locator.filter({ visible: true });
  await page.goto(businessUrl + "/orders/new" + (kind === "pet" ? "?kind=pet" : ""));
  // Drinks say RGB / PET; a goods depot says Returnable / Non-returnable.
  await page
    .getByRole("heading", { name: kind === "pet" ? /^New (PET|Non-returnable) orders$/ : /^New (RGB|Returnable) orders$/ })
    .waitFor();
  for (const [i, row] of rows.entries()) {
    if (i > 0) await vis(page.getByRole("button", { name: "Add customer" })).click();
    const region = page.getByRole("region", { name: `Customer ${i + 1}` });
    await pick(region, "Customer", row.customer);
    for (const [product, quantity] of row.lines) {
      await region.getByRole("button", { name: `Add ${product} for customer ${i + 1}` }).click();
      await region.getByRole("textbox", { name: `${product} for customer ${i + 1}` }).fill(String(quantity));
    }
  }
  if (options.beforeSave) await options.beforeSave();
  if (options.save === false) return [];
  await vis(page.getByRole("button", { name: /^Save( \d+ orders| order)$/ })).click();
  await page.waitForURL(/\/orders\?saved=batch&ids=/);
  return new URL(page.url()).searchParams.get("ids").split(",");
}

/** Stock in on a drinks depot's product cards: Add, then how many came in. */
async function receiveCards(page, rows) {
  const vis = (locator) => locator.filter({ visible: true });
  for (const [name, quantity] of rows) {
    await vis(page.getByRole("button", { name: `Add ${name}`, exact: true })).click();
    await vis(page.getByRole("textbox", { name: `${name} received` })).fill(String(quantity));
  }
}

module.exports = { pick, addCrew, newOrders, receiveCards };
