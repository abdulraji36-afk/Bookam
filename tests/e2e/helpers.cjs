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

module.exports = { pick };
