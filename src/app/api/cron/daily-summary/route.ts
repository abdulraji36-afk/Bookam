import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { depotWords, say } from "@/lib/depot-words";
import { todayIn } from "@/lib/format";
import { formatDailyOperations } from "@/lib/reports/daily-telegram";
import { dayBounds, getDrinksDaily } from "@/lib/reports/drinks-daily";
import { createServiceClient } from "@/lib/supabase/service";
import { getTelegramConfig, sendTelegramMessage } from "@/lib/telegram";

const DAY = /^\d{4}-\d{2}-\d{2}$/;

function authorised(request: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  return given.length === expected.length && timingSafeEqual(given, expected);
}

/** The day before `day` (YYYY-MM-DD). */
function dayBefore(day: string) {
  const date = new Date(`${day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 1);
  return date.toISOString().slice(0, 10);
}

/**
 * Bilikis's end-of-day Telegram summary. A scheduler calls this once a day,
 * just after midnight, with `Authorization: Bearer <CRON_SECRET>`. Each drinks
 * business with Telegram linked and switched on gets the summary of the day
 * that just ended in its own time zone, once. `?date=YYYY-MM-DD` sends that
 * day again, for every such business.
 */
export async function GET(request: NextRequest) {
  if (!authorised(request)) return NextResponse.json({ error: "Not allowed." }, { status: 401 });
  const supabase = createServiceClient();
  if (!supabase || !getTelegramConfig()) {
    return NextResponse.json({ error: "Telegram or the secret key is not set up on the server." }, { status: 503 });
  }
  const asked = request.nextUrl.searchParams.get("date");
  if (asked !== null && !DAY.test(asked)) return NextResponse.json({ error: "Use date=YYYY-MM-DD." }, { status: 400 });

  // The chat id is never readable through the signed-in API, so it is not in
  // the shared types; the secret-key client can read it.
  const { data, error } = await supabase
    .from("organization_notifications")
    .select("organization_id, telegram_chat_id, daily_summary_sent_for, organizations!inner (*)")
    .eq("is_enabled", true)
    .not("telegram_chat_id", "is", null)
    .eq("organizations.sells_drinks", true);
  if (error) {
    console.error("Daily summary targets could not load:", error.message);
    return NextResponse.json({ error: "Could not load the businesses." }, { status: 500 });
  }
  const targets = (data ?? []) as unknown as {
    organization_id: string;
    telegram_chat_id: number | null;
    daily_summary_sent_for: string | null;
    organizations: { name: string; timezone: string; sells_drinks: boolean; trade?: string } | null;
  }[];

  const now = Date.now();
  const results: { organization: string; day: string; sent: boolean }[] = [];
  for (const target of targets) {
    const org = target.organizations;
    if (!org || !target.telegram_chat_id) continue;
    const day = asked ?? dayBefore(todayIn(org.timezone, now));
    if (!asked && target.daily_summary_sent_for && target.daily_summary_sent_for >= day) continue;

    const { start, end } = dayBounds(day, org.timezone);
    const [report, shortages, corrections] = await Promise.all([
      getDrinksDaily(supabase, target.organization_id, day, org.timezone, true),
      supabase
        .from("empty_shortage_lines")
        .select("outstanding")
        .eq("organization_id", target.organization_id)
        .gt("outstanding", 0)
        .limit(5000),
      supabase
        .from("audit_logs")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", target.organization_id)
        .like("action", "correct\\_%")
        .gte("created_at", start)
        .lt("created_at", end)
    ]);
    if (!report.data) {
      console.error("Daily summary could not be built:", report.error);
      results.push({ organization: target.organization_id, day, sent: false });
      continue;
    }
    // A goods depot gets the summary in its own words (Returnable, its own name).
    let pool: string | null = null;
    if (org.trade === "goods") {
      const { data: item } = await supabase
        .from("returnable_items")
        .select("name")
        .eq("organization_id", target.organization_id)
        .order("created_at")
        .limit(1)
        .maybeSingle();
      pool = item?.name ?? null;
    }
    const words = depotWords(org.trade, pool);
    const drinksText = formatDailyOperations({
      businessName: org.name,
      day,
      timeZone: org.timezone,
      data: report.data,
      outstandingCases: (shortages.data ?? []).length,
      outstandingEmpties: (shortages.data ?? []).reduce((sum, row) => sum + Number(row.outstanding), 0),
      corrections: corrections.count ?? 0
    });
    const text = say(words, drinksText);
    const sent = await sendTelegramMessage(Number(target.telegram_chat_id), text);
    if (sent && !asked) {
      await supabase
        .from("organization_notifications")
        .update({ daily_summary_sent_for: day } as never)
        .eq("organization_id", target.organization_id);
    }
    results.push({ organization: target.organization_id, day, sent });
  }
  return NextResponse.json({ sent: results.filter((result) => result.sent).length, results });
}
