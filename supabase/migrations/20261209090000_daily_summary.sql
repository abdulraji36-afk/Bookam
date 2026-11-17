-- Bilikis's end-of-day Telegram summary: remember the last day sent for each
-- business, so a repeated scheduled run never sends the same day twice. Only
-- the server's scheduled job (with the secret key) reads or writes it.

alter table public.organization_notifications
  add column daily_summary_sent_for date;
