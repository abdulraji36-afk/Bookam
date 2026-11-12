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

export function firstIssue(error: z.ZodError) {
  return error.issues[0]?.message ?? "Please check the form and try again.";
}
