import { describe, expect, it } from "vitest";
import { depotWords, say } from "../../src/lib/depot-words";

describe("depot words", () => {
  const drinks = depotWords("drinks");
  const gas = depotWords("goods", "Empty cylinders");

  it("drinks keeps its own words", () => {
    expect(say(drinks, "RGB orders and 20 empties owed")).toBe("RGB orders and 20 empties owed");
  });

  it("a goods depot says Returnable, Non-returnable and its own name", () => {
    expect(say(gas, "RGB orders")).toBe("Returnable orders");
    expect(say(gas, "PET sold today")).toBe("Non-returnable sold today");
    expect(say(gas, "New RGB orders")).toBe("New returnable orders");
    expect(say(gas, "an RGB sale stays RGB")).toBe("a returnable sale stays returnable");
    expect(say(gas, "Monitor unfinished PET and RGB sales.")).toBe("Monitor unfinished non-returnable and returnable sales.");
    expect(say(gas, "RGB")).toBe("Returnable");
    expect(say(gas, "Stock left: 25 · RGB")).toBe("Stock left: 25 · Returnable");
    expect(say(gas, "+ New exchange")).toBe("+ New supplier return");
    expect(say(gas, "Recorded a supplier exchange")).toBe("Recorded a supplier return");
    expect(say(gas, "Review the stock position and the empty balance.")).toBe("Review the stock position and the returns balance.");
    expect(say(gas, "draft trips and RGB empty returns")).toBe("draft trips and empty cylinders coming back");
    expect(say(gas, "Review empties and the RGB cases delivered.")).toBe("Review empty cylinders and the returnable goods delivered.");
    expect(say(gas, "customers whose RGB returns came back short")).toBe("customers whose empty cylinders came back short");
    expect(say(gas, "Empties in store")).toBe("Empty cylinders in store");
    expect(say(gas, "20 empties owed")).toBe("20 empty cylinders owed");
    expect(say(gas, "Empty shortages")).toBe("Return shortages");
    expect(say(gas, "Empty exchanges")).toBe("Supplier returns");
    expect(say(gas, "New empty exchange")).toBe("New supplier return");
    expect(say(gas, "Empty balance")).toBe("Returns balance");
    expect(say(gas, "Opening empties")).toBe("Opening empty cylinders");
    expect(say(gas, "50 crates and 15 packs")).toBe("50 units and 15 units");
    expect(say(gas, "RGB crates delivered")).toBe("Returnable goods delivered");
    expect(say(gas, "Drinks are sold to saved customers only")).toBe("Goods are sold to saved customers only");
    expect(say(gas, "This drink")).toBe("This product");
  });

  it("a goods depot without a name says Returnables", () => {
    expect(say(depotWords("goods", ""), "Empties")).toBe("Returnables");
  });
});
