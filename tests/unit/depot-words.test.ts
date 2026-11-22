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
    expect(say(gas, "New RGB orders")).toBe("New Returnable orders");
    expect(say(gas, "an RGB sale stays RGB")).toBe("a returnable sale stays Returnable");
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
