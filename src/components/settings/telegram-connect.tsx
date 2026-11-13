"use client";

import { useActionState } from "react";
import type { TelegramLinks } from "@/app/actions/notifications";
import { ActionButton } from "@/components/team/action-button";
import { Alert } from "@/components/ui/alert";
import { buttonClass } from "@/components/ui/button";
import { SubmitButton } from "@/components/ui/submit-button";
import type { ActionState } from "@/lib/action-state";

type Props = {
  startAction: (previous: ActionState<TelegramLinks>) => Promise<ActionState<TelegramLinks>>;
  refreshAction: (previous: ActionState) => Promise<ActionState>;
};

const initial: ActionState<TelegramLinks> = { ok: false, message: "" };

export function TelegramConnect({ startAction, refreshAction }: Props) {
  const [state, formAction] = useActionState(startAction, initial);
  const links = state.ok ? state.data : undefined;

  if (!links) {
    return (
      <form action={formAction} className="space-y-3">
        {!state.ok && state.message ? <Alert tone="error">{state.message}</Alert> : null}
        <SubmitButton pendingLabel="Preparing…">Connect Telegram</SubmitButton>
      </form>
    );
  }

  return (
    <div className="space-y-4 rounded-md border-2 border-ink bg-paper p-4">
      <ol className="list-decimal space-y-3 pl-5 font-medium">
        <li>
          Open one of these on a phone or computer where you use Telegram:
          <div className="mt-2 flex flex-wrap gap-2">
            <a href={links.groupLink} target="_blank" rel="noreferrer" className={buttonClass("primary", "sm")}>
              Add to a group
            </a>
            <a href={links.privateLink} target="_blank" rel="noreferrer" className={buttonClass("secondary", "sm")}>
              Send to me only
            </a>
          </div>
        </li>
        <li>In Telegram, choose the group (or press Start). The bot replies when it is connected.</li>
        <li>Come back here and press Check connection.</li>
      </ol>
      <p className="text-sm text-ink-soft">
        The link works once, for 30 minutes. If the bot is already in your group, send this message in
        the group instead: <code className="break-all font-bold text-ink">{links.command}</code>
      </p>
      <ActionButton action={refreshAction} label="Check connection" pendingLabel="Checking…" variant="secondary" />
    </div>
  );
}
