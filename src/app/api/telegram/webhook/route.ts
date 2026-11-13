import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getSupabaseEnv } from "@/lib/env";
import { getTelegramConfig, sendTelegramMessage } from "@/lib/telegram";
import type { Database } from "@/types/database";

function sameSecret(given: string | null, expected: string) {
  if (!given) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Telegram calls this whenever someone messages the bot. Its only job is to
 * finish linking a chat: the "/start <code>" that Telegram sends when someone
 * opens a business's connect link.
 */
export async function POST(request: NextRequest) {
  const config = getTelegramConfig();
  if (!config?.webhookSecret || !sameSecret(request.headers.get("x-telegram-bot-api-secret-token"), config.webhookSecret)) {
    return new NextResponse(null, { status: 401 });
  }

  // Always answer 200 from here on, or Telegram keeps re-sending the update.
  const done = new NextResponse(null, { status: 200 });
  const update = await request.json().catch(() => null);
  const message = update?.message;
  const chatId = message?.chat?.id;
  const text = typeof message?.text === "string" ? message.text.trim() : "";
  if (typeof chatId !== "number" || !text.startsWith("/start")) return done;

  const code = text.match(/^\/start(?:@\w+)?\s+([0-9a-f]{32})$/)?.[1];
  if (!code) {
    await sendTelegramMessage(chatId, "To connect this chat to your business, open the link on the Settings page in Bookam.");
    return done;
  }

  const { url, publishableKey } = getSupabaseEnv();
  const supabase = createClient<Database>(url, publishableKey, { auth: { persistSession: false } });
  const { data: businessName } = await supabase.rpc("complete_telegram_link", {
    p_code: code,
    p_chat_id: chatId,
    p_chat_title: message.chat.title ?? message.chat.first_name ?? null
  });

  await sendTelegramMessage(
    chatId,
    businessName
      ? `Connected to ${businessName}. Orders, dispatches, returns and stock changes will be posted here.`
      : "That link has expired or was already used. Create a new one on the Settings page in Bookam."
  );
  return done;
}
