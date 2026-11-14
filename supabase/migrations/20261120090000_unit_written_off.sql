-- A serial-numbered unit can be written off (lost, stolen, damaged beyond
-- sale). Kept in its own file: a new enum value can only be used once the
-- statement adding it has been committed.

alter type public.unit_status add value if not exists 'written_off';
