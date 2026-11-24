import { describe, expect, it } from "vitest";
import { parsePlainNumber, readQuantity, returnableAdjustmentSchema } from "../../src/lib/validation";

// Found in testing: "1e3" was saved as 1,000 empties and "0x10" as 16.
describe("numbers typed into forms", () => {
  it("reads plain digits, thousands commas and decimals", () => {
    expect(parsePlainNumber("1200")).toBe(1200);
    expect(parsePlainNumber(" 1,200 ")).toBe(1200);
    expect(parsePlainNumber("2.5")).toBe(2.5);
    expect(parsePlainNumber("0")).toBe(0);
    expect(parsePlainNumber("")).toBeUndefined();
  });

  it("refuses anything JavaScript would stretch into a number", () => {
    for (const text of ["1e3", "0x10", "0b11", "0o7", "Infinity", "-5", "+5", "1 000", "12,34", ".5", "5.", "1_000", "١٢"]) {
      expect(Number.isNaN(parsePlainNumber(text)), text).toBe(true);
      expect(Number.isNaN(readQuantity(text)), text).toBe(true);
    }
  });

  it("an empties adjustment of 1e3 is refused", () => {
    const base = {
      locationId: "3f1c2b4e-1111-4222-8333-444455556666",
      adjustmentDate: "2026-11-21",
      returnableItemId: "3f1c2b4e-1111-4222-8333-444455556667",
      direction: "add",
      reason: "purchase",
      customerId: "",
      note: ""
    };
    expect(returnableAdjustmentSchema.safeParse({ ...base, quantity: "1e3" }).success).toBe(false);
    expect(returnableAdjustmentSchema.safeParse({ ...base, quantity: "0x10" }).success).toBe(false);
    expect(returnableAdjustmentSchema.safeParse({ ...base, quantity: "1000" }).success).toBe(true);
  });
});

describe("names and phone numbers", () => {
  it("refuses hidden text-direction and zero-width characters in names", async () => {
    const { customerSchema } = await import("../../src/lib/validation");
    const customer = (name: string, phone = "") => customerSchema.safeParse({ name, phone, area: "", address: "" }).success;
    expect(customer("Mama Tunde")).toBe(true);
    expect(customer("Mama ‮ednuT")).toBe(false); // right-to-left override
    expect(customer("Mama​Tunde")).toBe(false); // zero-width space
    expect(customer("Mama ⁧Tunde⁩")).toBe(false); // isolate
    expect(customer("Ìyá Ọlá Stores")).toBe(true); // Yoruba letters are fine
  });

  it("phone numbers are digits, with spaces, dashes, brackets and a leading +", async () => {
    const { customerSchema } = await import("../../src/lib/validation");
    const phone = (value: string) => customerSchema.safeParse({ name: "Shop", phone: value, area: "", address: "" }).success;
    for (const ok of ["", "08031234567", "0803 123 4567", "+234 803 123 4567", "(0803) 123-4567"]) expect(phone(ok), ok).toBe(true);
    for (const bad of ["abc", "0803abc4567", "12345", "+234 803 123 4567 999 99", "0803‮1234567"]) expect(phone(bad), bad).toBe(false);
  });
});

describe("unitWord", () => {
  it("says the unit for how many there are", async () => {
    const { unitWord } = await import("../../src/lib/format");
    expect(unitWord(1, "crate")).toBe("crate");
    expect(unitWord(5, "crate")).toBe("crates");
    expect(unitWord(0, "pack")).toBe("packs");
    expect(unitWord(2, "box")).toBe("boxes");
    expect(unitWord(3, "battery")).toBe("batteries");
    expect(unitWord(4, "kg")).toBe("kg");
    expect(unitWord(4, "pcs")).toBe("pcs");
    expect(unitWord(4, "50cl bottle")).toBe("50cl bottle");
    expect(unitWord(4, "")).toBe("");
    expect(unitWord(2, "gas cylinder")).toBe("gas cylinders");
  });
});
