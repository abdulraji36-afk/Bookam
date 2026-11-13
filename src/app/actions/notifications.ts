"use server";

import { revalidatePath } from "next/cache";
import { describeDbError, type ActionState } from "@/lib/action-state";
import { MANAGER_ROLES, requireOrg } from "@/lib/org";
import { getTelegramConfig, sendTelegramMessage } from "@/lib/telegram";

export type TelegramLinks = { groupLink: string; privateLink: string; command: string };

export async function startTelegramLinkAction(
  slug: string,
  _previous: ActionState<TelegramLinks>
): Promise<ActionState<TelegramLinks>> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);
  const config = getTelegramConfig();
  if (!config) return { ok: false, message: "Telegram is not set up for BukAm yet." };

  const { data: code, error } = await supabase.rpc("start_telegram_link", { p_organization_id: org.id });
  if (error || !code) return { ok: false, message: describeDbError(error) };

  return {
    ok: true,
    message: "Link ready.",
    data: {
      groupLink: `https://t.me/${config.username}?startgroup=${code}`,
      privateLink: `https://t.me/${config.username}?start=${code}`,
      command: `/start@${config.username} ${code}`
    }
  };
}

/** Re-reads the settings page, to pick up a link completed in Telegram. */
export async function refreshNotificationsAction(slug: string, _previous: ActionState): Promise<ActionState> {
  await requireOrg(slug, MANAGER_ROLES);
  revalidatePath(`/b/${slug}/settings`);
  return { ok: true, message: "" };
}

export async function sendTestNotificationAction(slug: string, _previous: ActionState): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const { data } = await supabase.rpc("get_notification_target", { p_organization_id: org.id });
  const target = data?.[0];
  if (!target) return { ok: false, message: "Telegram is not connected, or notifications are paused." };

  const sent = await sendTelegramMessage(
    Number(target.chat_id),
    `${org.name}\nThis is a test message from BukAm. Notifications are working.\nBy ${target.actor_name}`
  );
  return sent
    ? { ok: true, message: "Test message sent. Check your Telegram chat." }
    : { ok: false, message: "Telegram did not accept the message. Check the bot is still in the chat." };
}

export async function setNotificationsEnabledAction(
  slug: string,
  isEnabled: boolean,
  _previous: ActionState
): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const { error } = await supabase.rpc("set_notifications_enabled", {
    p_organization_id: org.id,
    p_is_enabled: isEnabled
  });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}/settings`);
  return { ok: true, message: isEnabled ? "Notifications resumed." : "Notifications paused." };
}

export async function disconnectTelegramAction(slug: string, _previous: ActionState): Promise<ActionState> {
  const { supabase, org } = await requireOrg(slug, MANAGER_ROLES);

  const { error } = await supabase.rpc("disconnect_telegram", { p_organization_id: org.id });
  if (error) return { ok: false, message: describeDbError(error) };

  revalidatePath(`/b/${slug}/settings`);
  return { ok: true, message: "Telegram disconnected." };
}
