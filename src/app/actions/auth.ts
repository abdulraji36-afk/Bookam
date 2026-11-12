"use server";

import { redirect } from "next/navigation";
import type { ActionState } from "@/lib/action-state";
import { safeNextPath } from "@/lib/safe-next";
import { getSiteUrl } from "@/lib/site-url";
import { createClient } from "@/lib/supabase/server";
import { firstIssue, signInSchema, signUpSchema } from "@/lib/validation";

export async function signInAction(_previous: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = signInSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    const message =
      error.code === "email_not_confirmed"
        ? "Confirm your email first. Check your inbox for the link we sent."
        : error.code === "invalid_credentials"
          ? "That email or password is not correct."
          : "We could not log you in. Please try again.";
    return { ok: false, message };
  }

  redirect(safeNextPath(formData.get("next")));
}

export async function signUpAction(
  _previous: ActionState<{ emailSent: boolean }>,
  formData: FormData
): Promise<ActionState<{ emailSent: boolean }>> {
  const parsed = signUpSchema.safeParse({
    fullName: formData.get("fullName"),
    email: formData.get("email"),
    password: formData.get("password")
  });
  if (!parsed.success) return { ok: false, message: firstIssue(parsed.error) };

  const next = safeNextPath(formData.get("next"), "/onboarding");
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { full_name: parsed.data.fullName },
      emailRedirectTo: `${await getSiteUrl()}/auth/confirm?next=${encodeURIComponent(next)}`
    }
  });

  if (error) {
    const message =
      error.code === "user_already_exists"
        ? "An account with this email already exists. Log in instead."
        : error.code === "weak_password"
          ? "Choose a stronger password."
          : error.code === "over_email_send_rate_limit"
            ? "Too many attempts. Please wait a minute and try again."
            : "We could not create your account. Please try again.";
    return { ok: false, message };
  }

  // With email confirmation switched on there is no session yet.
  if (!data.session) {
    return {
      ok: true,
      message: `We sent a confirmation link to ${parsed.data.email}. Open it to finish creating your account.`,
      data: { emailSent: true }
    };
  }

  redirect(next);
}
