// Shared by the walkthroughs: choosing from a searchable picker.
const escape = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/** Types into the picker labelled `label` and chooses the first entry matching `text`. */
async function pick(scope, label, text) {
  const box = scope.getByRole("combobox", { name: label, exact: true }).filter({ visible: true });
  const wanted = text.replace(/\s*\(.*$/, ""); // "Cola 50cl (crate)" -> "Cola 50cl"
  await box.click();
  await box.fill(wanted);
  await scope.getByRole("option", { name: new RegExp(escape(wanted)) }).first().click();
}

/**
 * Adds drivers and workers on the business's Drivers & workers page. A trip
 * can only take its driver and workers from that list.
 */
async function addCrew(page, businessUrl, drivers, workers = ["Sule"]) {
  const vis = (locator) => locator.filter({ visible: true });
  await page.goto(businessUrl + "/dispatch/crew");
  for (const [name, role] of [...drivers.map((n) => [n, "Driver"]), ...workers.map((n) => [n, "Worker"])]) {
    await vis(page.getByLabel("Name", { exact: true })).fill(name);
    await vis(page.getByLabel("Driver or worker?")).selectOption({ label: role });
    await vis(page.getByRole("button", { name: "Add to the list" })).click();
    await page.getByText(`${name} added.`).waitFor();
  }
}

module.exports = { pick, addCrew };
