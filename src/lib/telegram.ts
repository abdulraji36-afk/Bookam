import "server-only";

/** Settings for the one BukAm bot that serves every business. */
export function getTelegramConfig() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const username = process.env.TELEGRAM_BOT_USERNAME?.replace(/^@/, "");
  if (!token || !username) return null;

  return {
    token,
    username,
    webhookSecret: process.env.TELEGRAM_WEBHOOK_SECRET ?? null,
    // Overridable so tests can point at a stand-in for Telegram.
    apiBase: (process.env.TELEGRAM_API_BASE ?? "https://api.telegram.org").replace(/\/+$/, "")
  };
}

/** Sends one plain-text message. Returns whether Telegram accepted it. */
export async function sendTelegramMessage(chatId: number, text: string) {
  const config = getTelegramConfig();
  if (!config) return false;

  try {
    const response = await fetch(`${config.apiBase}/bot${config.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        // Telegram rejects messages over 4096 characters.
        text: text.slice(0, 4000),
        link_preview_options: { is_disabled: true }
      }),
      signal: AbortSignal.timeout(5000)
    });
    if (!response.ok) console.error("Telegram refused a message", response.status);
    return response.ok;
  } catch (error) {
    console.error("Telegram could not be reached", error instanceof Error ? error.message : error);
    return false;
  }
}
