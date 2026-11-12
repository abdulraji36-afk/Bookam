"use client";

import { useState } from "react";
import type { InviteResult } from "@/app/actions/team";
import { Alert } from "@/components/ui/alert";
import { Button, buttonClass } from "@/components/ui/button";
import { SelectField, TextField } from "@/components/ui/field";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";
import { useFormAction } from "@/lib/use-form-action";

type Props = {
  action: (
    previous: ActionState<InviteResult>,
    formData: FormData
  ) => Promise<ActionState<InviteResult>>;
  businessName: string;
  canInviteAdmin: boolean;
};

export function InviteForm({ action, businessName, canInviteAdmin }: Props) {
  const { state, pending, form } = useFormAction(action, { resetOnSuccess: true });
  const [copied, setCopied] = useState(false);
  const invite = state.ok ? state.data : undefined;

  async function copyLink(link: string) {
    try {
      await navigator.clipboard.writeText(link);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="space-y-4">
      <form
        {...form}
        onSubmit={(event) => {
          setCopied(false);
          form.onSubmit(event);
        }}
        className="grid gap-4 sm:grid-cols-[1fr_10rem_auto] sm:items-end"
      >
        <TextField
          label="Email address"
          name="email"
          type="email"
          inputMode="email"
          placeholder="name@example.com"
          required
        />
        <SelectField label="Role" name="role" defaultValue="staff">
          <option value="staff">Staff</option>
          {canInviteAdmin ? <option value="admin">Admin</option> : null}
        </SelectField>
        <SubmitButton pending={pending} pendingLabel="Creating…">
          Create invite
        </SubmitButton>
      </form>

      {!state.ok && state.message ? <Alert tone="error">{state.message}</Alert> : null}

      {invite ? (
        <div className="space-y-3 rounded-md border-2 border-ink bg-paper p-4">
          <p className="text-sm font-medium text-ink">
            Send this link to <strong>{invite.email}</strong>. It works once, for 7 days, and is only
            shown now.
          </p>
          <input
            readOnly
            value={invite.link}
            aria-label="Invitation link"
            onFocus={(event) => event.currentTarget.select()}
            className="block min-h-12 w-full rounded-md border-2 border-field bg-white px-3 text-sm font-medium"
          />
          <div className="flex flex-wrap gap-2">
            <Button type="button" variant="secondary" size="sm" onClick={() => copyLink(invite.link)}>
              {copied ? "Copied" : "Copy link"}
            </Button>
            <a
              className={buttonClass("secondary", "sm")}
              target="_blank"
              rel="noreferrer"
              href={`https://wa.me/?text=${encodeURIComponent(
                `You have been invited to join ${businessName} on Bookam. Open this link to join: ${invite.link}`
              )}`}
            >
              Share on WhatsApp
            </a>
          </div>
        </div>
      ) : null}
    </div>
  );
}
