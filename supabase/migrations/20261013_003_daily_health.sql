-- Lovebug Booth v0.5.4 - daily health heartbeat.
-- Required existing table: public.keep_alive_log(id, source, pinged_at).
-- No existing data is removed. The table contained zero rows at design time.
-- Run ONCE in the Supabase SQL Editor BEFORE deploying the Edge Function.

begin;

-- The public browser keys must never read or modify the heartbeat table.
alter table public.keep_alive_log enable row level security;
revoke all privileges on table public.keep_alive_log from public, anon, authenticated;

-- Daily upsert is idempotent PER SOURCE in UTC. The external cron and GitHub
-- action each get one current record per day, even after retries.
alter table public.keep_alive_log
  add column if not exists heartbeat_day date;

update public.keep_alive_log
set heartbeat_day = (pinged_at at time zone 'UTC')::date
where heartbeat_day is null;

alter table public.keep_alive_log
  alter column heartbeat_day set default ((now() at time zone 'UTC')::date),
  alter column heartbeat_day set not null;

alter table public.keep_alive_log
  add column if not exists website_ok boolean,
  add column if not exists website_http_status integer,
  add column if not exists website_latency_ms integer;

create unique index if not exists keep_alive_log_source_day_uidx
  on public.keep_alive_log (source, heartbeat_day);

-- Service credentials stay inside the Edge Function; no browser policy is
-- created. Edge Function secret keys / legacy service_role bypass RLS.
grant select, insert, update, delete on public.keep_alive_log to service_role;

comment on table public.keep_alive_log is
  'Private scheduled health records. Not exposed to anon or authenticated clients.';

commit;
