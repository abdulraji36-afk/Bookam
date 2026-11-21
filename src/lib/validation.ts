import { z } from "zod";

/**
 * Numbers typed into a form: plain digits only, with optional thousands
 * commas and a decimal point ("1200", "1,200", "2.5"). Anything else, such
 * as "1e3", "0x10", "Infinity" or " 5 6", is not a number here, even though
 * JavaScript would read some of those as one.
 */
const PLAIN_NUMBER = /^(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d+)?$/;

/** "" or nothing is undefined (not given); a plain number is that number; anything else is NaN. */
export function parsePlainNumber(value: unknown): number | undefined {
  if (value === null || value === undefined) return undefined;
  if (typeof value === "number") return value;
  const text = String(value).trim();
  if (text === "") return undefined;
  return PLAIN_NUMBER.test(text) ? Number(text.replace(/,/g, "")) : Number.NaN;
}

/**
 * Characters that flip the direction text is shown in, or are invisible
 * (right-to-left override, isolates, zero-width marks). They can make a name
 * show as something else ("Mama Tunde" displayed from "ednuT amaM"), so
 * no text field accepts them.
 */
const HIDDEN_CHARACTERS = /[\u200B-\u200F\u202A-\u202E\u2060-\u2069\u061C\uFEFF]/;

/** A trimmed text field that refuses hidden direction and zero-width characters. */
export const safeText = () =>
  z
    .string()
    .trim()
    .refine((value) => !HIDDEN_CHARACTERS.test(value), "Remove the hidden formatting characters from this text.");

/**
 * A phone number: digits, with spaces, dashes, brackets and a leading +
 * allowed, 7 to 15 digits in all. Empty means none given.
 */
export const phoneText = () =>
  safeText()
    .max(30, "That phone number is too long.")
    .refine(
      (value) =>
        value === "" ||
        (/^\+?[\d\s()-]+$/.test(value) && value.replace(/\D/g, "").length >= 7 && value.replace(/\D/g, "").length <= 15),
      "Enter a phone number using digits only, such as 0803 123 4567 or +234 803 123 4567."
    );

/** A number field read with parsePlainNumber, then checked by `schema`. */
export const plainNumber = <T extends z.ZodType>(schema: T) => z.preprocess(parsePlainNumber, schema);

const email = safeText()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254, "That email address is too long."));

export const signUpSchema = z.object({
  fullName: safeText().min(2, "Enter your full name.").max(120, "That name is too long."),
  email,
  password: z
    .string()
    .min(8, "Use at least 8 characters for your password.")
    .max(72, "Use at most 72 characters for your password.")
});

export const forgotPasswordSchema = z.object({ email });

export const newPasswordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Use at least 8 characters for your password.")
      .max(72, "Use at most 72 characters for your password."),
    confirm: z.string()
  })
  .refine((value) => value.password === value.confirm, "The two passwords do not match.");

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.")
});

export const businessSchema = z.object({
  name: safeText()
    .min(2, "Enter your business name.")
    .max(80, "Use at most 80 characters for the business name."),
  businessType: safeText().max(60, "Use at most 60 characters.").optional()
});

export const inviteSchema = z.object({
  email,
  role: z.enum(["admin", "staff"], "Choose Admin or Staff.")
});

export const locationSchema = z.object({
  name: safeText()
    .min(2, "Enter a name for the location.")
    .max(80, "Use at most 80 characters for the location name.")
});

/** An optional money or quantity field: empty means "not set". */
const optionalAmount = (label: string) =>
  safeText()
    .transform((value) => (value === "" ? null : (parsePlainNumber(value) ?? null)))
    .refine((value) => value === null || (Number.isFinite(value) && value >= 0), {
      message: `${label} must be a number, zero or more.`
    });

export const productSchema = z
  .object({
    name: safeText().min(2, "Enter the product name.").max(80, "Use at most 80 characters."),
    sku: safeText().max(40, "Use at most 40 characters for the product code."),
    unit: safeText().min(1, "Enter the unit, such as crate or pack.").max(30),
    sellingPrice: optionalAmount("Selling price"),
    costPrice: optionalAmount("Buying cost"),
    lowStock: optionalAmount("Low stock level"),
    requiresReturn: z.boolean(),
    returnItemName: safeText().max(60, "Use at most 60 characters."),
    tracksSerials: z.boolean(),
    warrantyMonths: safeText()
      .transform((value) => (value === "" ? null : /^\d+$/.test(value) ? Number(value) : Number.NaN))
      .refine((value) => value === null || (Number.isInteger(value) && value >= 1 && value <= 120), {
        message: "Warranty must be a whole number of months, from 1 to 120."
      })
  })
  .refine((value) => !value.requiresReturn || value.returnItemName.length >= 2, {
    message: "Say what the customer must bring back, such as Empty crate."
  });

export const customerSchema = z.object({
  name: safeText().min(2, "Enter the customer's name.").max(80, "Use at most 80 characters."),
  phone: phoneText(),
  area: safeText().max(80, "Use at most 80 characters for the area."),
  address: safeText().max(200, "Use at most 200 characters for the address.")
});

const lineQuantity = z
  .number("Enter a quantity on every line.")
  .positive("Quantities must be greater than zero.")
  .max(9_999_999, "That quantity is too large.")
  .optional();

const receiptLine = z
  .object({
    productId: z.uuid("Choose a product on every line."),
    /** Serial-numbered products list their units instead of a quantity. */
    tracked: z.boolean(),
    quantity: lineQuantity,
    units: z
      .array(
        z.object({
          serial: z
            .string()
            .transform((value) => value.replace(/\s/g, "").toUpperCase())
            .pipe(
              z
                .string()
                .min(3, "Serial numbers must be 3 to 40 characters long.")
                .max(40, "Serial numbers must be 3 to 40 characters long.")
                .regex(/^[A-Z0-9./-]+$/, "Serial numbers use letters, digits, dots, slashes and dashes only.")
            ),
          colour: safeText().max(30, "Colours must be 30 characters or fewer.")
        })
      )
      .max(500, "A single receipt can hold up to 500 serial numbers.")
  })
  .refine((line) => line.tracked || line.quantity !== undefined, { message: "Enter a quantity on every line." });

export const stockReceiptSchema = z.object({
  locationId: z.uuid("Choose a location."),
  receivedDate: z.iso.date("Enter the date the stock arrived."),
  supplierName: safeText().max(80, "Use at most 80 characters for the supplier."),
  reference: safeText().max(80, "Use at most 80 characters for the reference."),
  note: safeText().max(500, "Use at most 500 characters for the note."),
  items: z.array(receiptLine).min(1, "Add at least one product.").max(200, "A single receipt can hold up to 200 products.")
});

const orderLine = z
  .object({
    productId: z.uuid("Choose a product on every line."),
    tracked: z.boolean(),
    quantity: lineQuantity,
    unitIds: z.array(z.uuid()).max(500, "A single line can hold up to 500 units.")
  })
  .refine((line) => line.tracked || line.quantity !== undefined, { message: "Enter a quantity on every line." });

export const orderSchema = z
  .object({
    locationId: z.uuid("Choose a location."),
    orderDate: z.iso.date("Enter the order date."),
    walkIn: z.boolean(),
    customerId: z.union([z.uuid(), z.literal("")]),
    buyerName: safeText().max(80, "Use at most 80 characters for the buyer's name."),
    buyerPhone: phoneText(),
    handedOver: z.boolean(),
    paymentType: z.enum(["cash", "transfer", "credit"], "Choose how the customer is paying."),
    note: safeText().max(500, "Use at most 500 characters for the note."),
    items: z.array(orderLine).min(1, "Add at least one product.").max(200, "A single order can hold up to 200 products.")
  })
  .refine((order) => order.walkIn || order.customerId !== "", {
    message: "Choose a customer, or tick Walk-in buyer."
  });

/** "" means not given; "1,200" means 1200. Anything else (such as "1e3") becomes NaN and fails validation. */
export function readQuantity(value: string | undefined) {
  return parsePlainNumber(value);
}

export const tripSchema = z.object({
  locationId: z.uuid("Choose a location."),
  dispatchDate: z.iso.date("Enter the dispatch date."),
  driverId: z.uuid("Choose the driver."),
  workerIds: z.array(z.uuid()).min(1, "Choose at least one worker who went with the load.").max(50),
  note: safeText().max(500, "Use at most 500 characters for the note."),
  orderIds: z.array(z.uuid()).min(1, "Choose at least one order to put on the trip.").max(500)
});

const quantity = plainNumber(z.number("Enter a quantity.")
  .positive("Enter a quantity greater than zero.")
  .max(9_999_999, "That quantity is too large."));

export const tripReturnsSchema = z.object({
  returnedDate: z.iso.date("Enter the date the trip came back."),
  returns: z
    .array(
      z.object({
        orderId: z.uuid(),
        returnableItemId: z.uuid(),
        quantity: plainNumber(z.number("Enter a number for every customer.")
          .min(0, "A returned quantity cannot be less than zero.")
          .max(9_999_999, "That quantity is too large."))
      })
    )
    .min(1, "There is nothing to record for this trip.")
});

export const supplierExchangeSchema = z.object({
  locationId: z.uuid("Choose a location."),
  exchangeDate: z.iso.date("Enter the date."),
  returnableItemId: z.uuid("Choose what the supplier took."),
  quantity,
  supplierName: safeText().max(80, "Use at most 80 characters for the supplier."),
  reference: safeText().max(80, "Use at most 80 characters for the reference."),
  receivedBy: safeText().max(80, "Use at most 80 characters."),
  note: safeText().max(500, "Use at most 500 characters for the note."),
  cratesDelivered: safeText()
    .refine((value) => value === "" || /^\d{1,7}$/.test(value), "Enter the RGB crates delivered as a whole number, or leave it empty.")
});

export const returnableAdjustmentSchema = z.object({
  locationId: z.uuid("Choose a location."),
  adjustmentDate: z.iso.date("Enter the date."),
  returnableItemId: z.uuid("Choose what you are adjusting."),
  direction: z.enum(["add", "subtract"], "Choose whether to add or subtract."),
  quantity,
  reason: z.enum(
    ["customer_return", "purchase", "opening_count", "correction", "damaged_or_lost", "given_to_customer"],
    "Choose a reason."
  ),
  customerId: z.union([z.uuid(), z.literal("")]),
  note: safeText().max(500, "Use at most 500 characters for the note.")
});

export const openingDebtSchema = z.object({
  customerId: z.uuid("Choose the customer."),
  returnableItemId: z.uuid("Choose what they owe."),
  quantity,
  note: safeText().max(500, "Use at most 500 characters for the note.")
});

export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}
