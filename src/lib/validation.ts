import { z } from "zod";

const email = z
  .string()
  .trim()
  .toLowerCase()
  .pipe(z.email("Enter a valid email address.").max(254, "That email address is too long."));

export const signUpSchema = z.object({
  fullName: z.string().trim().min(2, "Enter your full name.").max(120, "That name is too long."),
  email,
  password: z
    .string()
    .min(8, "Use at least 8 characters for your password.")
    .max(72, "Use at most 72 characters for your password.")
});

export const signInSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.")
});

export const businessSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter your business name.")
    .max(80, "Use at most 80 characters for the business name."),
  businessType: z.string().trim().max(60, "Use at most 60 characters.").optional()
});

export const inviteSchema = z.object({
  email,
  role: z.enum(["admin", "staff"], "Choose Admin or Staff.")
});

export const locationSchema = z.object({
  name: z
    .string()
    .trim()
    .min(2, "Enter a name for the location.")
    .max(80, "Use at most 80 characters for the location name.")
});

/** An optional money or quantity field: empty means "not set". */
const optionalAmount = (label: string) =>
  z
    .string()
    .trim()
    .transform((value) => (value === "" ? null : Number(value.replace(/,/g, ""))))
    .refine((value) => value === null || (Number.isFinite(value) && value >= 0), {
      message: `${label} must be a number, zero or more.`
    });

export const productSchema = z
  .object({
    name: z.string().trim().min(2, "Enter the product name.").max(80, "Use at most 80 characters."),
    sku: z.string().trim().max(40, "Use at most 40 characters for the product code."),
    unit: z.string().trim().min(1, "Enter the unit, such as crate or pack.").max(30),
    sellingPrice: optionalAmount("Selling price"),
    costPrice: optionalAmount("Buying cost"),
    lowStock: optionalAmount("Low stock level"),
    requiresReturn: z.boolean(),
    returnItemName: z.string().trim().max(60, "Use at most 60 characters.")
  })
  .refine((value) => !value.requiresReturn || value.returnItemName.length >= 2, {
    message: "Say what the customer must bring back, such as Empty crate."
  });

export const customerSchema = z.object({
  name: z.string().trim().min(2, "Enter the customer's name.").max(80, "Use at most 80 characters."),
  phone: z.string().trim().max(30, "That phone number is too long."),
  area: z.string().trim().max(80, "Use at most 80 characters for the area."),
  address: z.string().trim().max(200, "Use at most 200 characters for the address.")
});

export const stockReceiptSchema = z.object({
  locationId: z.uuid("Choose a location."),
  receivedDate: z.iso.date("Enter the date the stock arrived."),
  supplierName: z.string().trim().max(80, "Use at most 80 characters for the supplier."),
  reference: z.string().trim().max(80, "Use at most 80 characters for the reference."),
  note: z.string().trim().max(500, "Use at most 500 characters for the note."),
  items: z
    .array(
      z.object({
        productId: z.uuid("Choose a product on every line."),
        quantity: z.coerce
          .number("Enter a quantity on every line.")
          .positive("Quantities must be greater than zero.")
          .max(9_999_999, "That quantity is too large.")
      })
    )
    .min(1, "Add at least one product.")
    .max(200, "A single receipt can hold up to 200 products.")
});

const lineItems = (limitMessage: string) =>
  z
    .array(
      z.object({
        productId: z.uuid("Choose a product on every line."),
        quantity: z.coerce
          .number("Enter a quantity on every line.")
          .positive("Quantities must be greater than zero.")
          .max(9_999_999, "That quantity is too large.")
      })
    )
    .min(1, "Add at least one product.")
    .max(200, limitMessage);

export const orderSchema = z.object({
  locationId: z.uuid("Choose a location."),
  orderDate: z.iso.date("Enter the order date."),
  customerId: z.uuid("Choose a customer."),
  paymentType: z.enum(["cash", "transfer", "credit"], "Choose how the customer is paying."),
  note: z.string().trim().max(500, "Use at most 500 characters for the note."),
  items: lineItems("A single order can hold up to 200 products.")
});

export const tripSchema = z.object({
  locationId: z.uuid("Choose a location."),
  dispatchDate: z.iso.date("Enter the dispatch date."),
  driverName: z.string().trim().min(2, "Enter the driver's name.").max(80, "Use at most 80 characters."),
  vehicle: z.string().trim().max(80, "Use at most 80 characters for the vehicle."),
  note: z.string().trim().max(500, "Use at most 500 characters for the note."),
  orderIds: z.array(z.uuid()).min(1, "Choose at least one order to put on the trip.").max(500)
});

const quantity = z.coerce
  .number("Enter a quantity.")
  .positive("Enter a quantity greater than zero.")
  .max(9_999_999, "That quantity is too large.");

export const tripReturnsSchema = z.object({
  returnedDate: z.iso.date("Enter the date the trip came back."),
  returns: z
    .array(
      z.object({
        orderId: z.uuid(),
        returnableItemId: z.uuid(),
        quantity: z.coerce
          .number("Enter a number for every customer.")
          .min(0, "A returned quantity cannot be less than zero.")
          .max(9_999_999, "That quantity is too large.")
      })
    )
    .min(1, "There is nothing to record for this trip.")
});

export const supplierExchangeSchema = z.object({
  locationId: z.uuid("Choose a location."),
  exchangeDate: z.iso.date("Enter the date."),
  returnableItemId: z.uuid("Choose what the supplier took."),
  quantity,
  supplierName: z.string().trim().max(80, "Use at most 80 characters for the supplier."),
  reference: z.string().trim().max(80, "Use at most 80 characters for the reference."),
  receivedBy: z.string().trim().max(80, "Use at most 80 characters."),
  note: z.string().trim().max(500, "Use at most 500 characters for the note.")
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
  note: z.string().trim().max(500, "Use at most 500 characters for the note.")
});

export const openingDebtSchema = z.object({
  customerId: z.uuid("Choose the customer."),
  returnableItemId: z.uuid("Choose what they owe."),
  quantity,
  note: z.string().trim().max(500, "Use at most 500 characters for the note.")
});

export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}
