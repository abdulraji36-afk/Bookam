-- Iteration 14: no stock write-offs.
--
-- Stock now only changes through deliveries (and their corrections) and
-- orders. Damaged or expired goods are handled the way the business already
-- does: an order to a customer such as "Breakages", which is then switched
-- off. Write-offs recorded before this stay in the stock history; no new ones
-- can be made, and the old ones are no longer voided from the app.

revoke execute on function public.record_stock_adjustment(uuid, uuid, date, uuid, text, numeric, public.stock_adjustment_reason, text, uuid[]) from authenticated;
revoke execute on function public.void_stock_adjustment(uuid, text) from authenticated;
