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
 * Fills the New order page of a drinks business (one page for customers and
 * walk-in buyers, with RGB and PET tabs) and saves it.
 *
 *   rows: [{ customer: "Mama Tunde Stores", lines: [["Cola 50cl", 40]] },
 *          { walkIn: { name: "Tunde Bello", phone: "0803", takesNow: true }, lines: [[...]] }]
 *
 * Gives back the ids of the orders saved, in the order of the rows. Pass
 * `beforeSave` to look at the filled page first, or `save: false` to stop
 * before saving.
 */
async function newOrders(page, businessUrl, kind, rows, options = {}) {
  const vis = (locator) => locator.filter({ visible: true });
  await page.goto(
    businessUrl + "/orders/new" + (kind === "pet" ? "?kind=pet" : ""),
  );
  await page
    .getByRole("heading", {
      name: kind === "pet" ? "New PET orders" : "New RGB orders",
    })
    .waitFor();
  for (const [i, row] of rows.entries()) {
    const walkIn = Boolean(row.walkIn);
    if (i > 0 || walkIn) {
      await vis(
        page.getByRole("button", {
          name: walkIn ? "Add walk-in buyer" : "Add customer",
        }),
      ).click();
    }
    // A walk-in as the first row: drop the empty customer card that starts the list.
    if (i === 0 && walkIn) {
      await page
        .getByRole("region", { name: "Customer 1" })
        .getByRole("button", { name: "Remove" })
        .click();
    }
    const position = i === 0 && walkIn ? 1 : i + 1;
    const name = walkIn ? `walk-in buyer ${position}` : `customer ${position}`;
    const region = page.getByRole("region", {
      name: walkIn ? `Walk-in buyer ${position}` : `Customer ${position}`,
    });
    if (walkIn) {
      await region.getByLabel("Buyer's name").fill(row.walkIn.name);
      if (row.walkIn.phone)
        await region.getByLabel("Phone (optional)").fill(row.walkIn.phone);
      const takesNow = region.getByLabel("Takes it at the counter now");
      if (row.walkIn.takesNow === false) await takesNow.uncheck();
    } else {
      await pick(region, "Customer", row.customer);
    }
    for (const [product, quantity] of row.lines) {
      await region
        .getByRole("button", { name: `Add ${product} for ${name}` })
        .click();
      await region
        .getByRole("textbox", { name: `${product} for ${name}` })
        .fill(String(quantity));
    }
  }
  if (options.beforeSave) await options.beforeSave();
  if (options.save === false) return [];
  await vis(
    page.getByRole("button", { name: /^Save( \d+ orders| order)$/ }),
  ).click();
  await page.waitForURL(/\/orders\?saved=batch&ids=/);
  return new URL(page.url()).searchParams.get("ids").split(",");
}

module.exports = { pick, addCrew, newOrders };
