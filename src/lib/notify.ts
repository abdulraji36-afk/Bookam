import "server-only";
import { after } from "next/server";
import type { OrgContext } from "@/lib/org";
import { getTelegramConfig, sendTelegramMessage } from "@/lib/telegram";

type Lines = (string | null | undefined | false)[];

/**
 * Tells the business's Telegram chat about something that just happened.
 *
 * It runs after the response has been sent, so a slow or failing Telegram
 * never delays or breaks the action itself. `build` is only called when the
 * business has a chat linked and notifications switched on.
 */
export function notify(context: Pick<OrgContext, "supabase" | "org">, build: () => Promise<Lines> | Lines) {
  if (!getTelegramConfig()) return;

  after(async () => {
    try {
      const { data } = await context.supabase.rpc("get_notification_target", {
        p_organization_id: context.org.id
      });
      const target = data?.[0];
      if (!target) return;

      const lines = (await build()).filter((line): line is string => Boolean(line));
      if (lines.length === 0) return;

      await sendTelegramMessage(
        Number(target.chat_id),
        [context.org.name, ...lines, `By ${target.actor_name}`].join("\n")
      );
    } catch (error) {
      console.error("Notification failed", error instanceof Error ? error.message : error);
    }
  });
}
