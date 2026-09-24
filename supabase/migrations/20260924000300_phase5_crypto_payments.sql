-- XSHOP Phase 5: configurable crypto payment methods and auditable manual verification.
-- No receiving addresses, exchange rates, or blockchain-verification claims are seeded.

begin;

alter table public.orders drop constraint orders_payment_status_check;
alter table public.orders add constraint orders_payment_status_check
  check (payment_status in ('unpaid', 'pending', 'submitted', 'verified', 'rejected', 'expired'));

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  asset_code text not null check (asset_code in ('USDT', 'USDC', 'BTC', 'ETH', 'TRX', 'LTC')),
  network_code text not null check (network_code in ('TRC20', 'ERC20', 'Bitcoin', 'Ethereum', 'TRON', 'Litecoin')),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 100),
  fiat_currency_code text not null check (fiat_currency_code ~ '^[A-Z]{3}$'),
  crypto_units_per_fiat numeric(38, 18) not null check (crypto_units_per_fiat > 0),
  asset_decimals smallint not null check (asset_decimals between 0 and 18),
  receiving_address text not null check (char_length(btrim(receiving_address)) between 8 and 200),
  status text not null default 'inactive' check (status in ('active', 'inactive')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check (
    (asset_code = 'USDT' and network_code in ('TRC20', 'ERC20'))
    or (asset_code = 'USDC' and network_code = 'ERC20')
    or (asset_code = 'BTC' and network_code = 'Bitcoin')
    or (asset_code = 'ETH' and network_code = 'Ethereum')
    or (asset_code = 'TRX' and network_code = 'TRON')
    or (asset_code = 'LTC' and network_code = 'Litecoin')
  ),
  unique (asset_code, network_code, fiat_currency_code)
);
create index payment_methods_public_idx on public.payment_methods (fiat_currency_code, status, asset_code, network_code);

create table public.payment_sessions (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  customer_id uuid not null references auth.users(id) on delete restrict,
  method_id uuid references public.payment_methods(id) on delete set null,
  asset_code text not null check (asset_code in ('USDT', 'USDC', 'BTC', 'ETH', 'TRX', 'LTC')),
  network_code text not null check (network_code in ('TRC20', 'ERC20', 'Bitcoin', 'Ethereum', 'TRON', 'Litecoin')),
  expected_amount numeric(38, 18) not null check (expected_amount > 0),
  order_currency_code text not null check (order_currency_code ~ '^[A-Z]{3}$'),
  receiving_address text not null check (char_length(receiving_address) between 8 and 200),
  asset_decimals smallint not null check (asset_decimals between 0 and 18),
  status text not null default 'pending' check (status in ('pending', 'submitted', 'verified', 'rejected', 'expired')),
  transaction_hash text check (transaction_hash is null or transaction_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,
  submitted_at timestamptz,
  verified_at timestamptz,
  verified_by uuid references auth.users(id) on delete set null,
  rejection_reason text check (rejection_reason is null or char_length(rejection_reason) <= 1000),
  updated_at timestamptz not null default now(),
  unique (id, order_id),
  check (expires_at > created_at),
  check ((status not in ('submitted', 'verified', 'rejected') or (transaction_hash is not null and submitted_at is not null))),
  check ((status not in ('verified', 'rejected') or verified_by is not null)),
  check ((status <> 'verified' or verified_at is not null))
);
create unique index payment_sessions_one_live_per_order
  on public.payment_sessions (order_id) where status in ('pending', 'submitted');
create unique index payment_sessions_transaction_hash_once
  on public.payment_sessions (transaction_hash) where transaction_hash is not null;
create index payment_sessions_customer_idx on public.payment_sessions (customer_id, created_at desc);
create index payment_sessions_status_expiry_idx on public.payment_sessions (status, expires_at);

create table public.payment_events (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null,
  order_id uuid not null references public.orders(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('created', 'transaction_submitted', 'verified', 'rejected', 'expired')),
  from_status text check (from_status is null or from_status in ('pending', 'submitted', 'verified', 'rejected', 'expired')),
  to_status text not null check (to_status in ('pending', 'submitted', 'verified', 'rejected', 'expired')),
  details jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 4096),
  created_at timestamptz not null default now(),
  foreign key (session_id, order_id) references public.payment_sessions(id, order_id) on delete restrict
);
create index payment_events_order_idx on public.payment_events (order_id, created_at);

alter table public.payment_methods enable row level security;
alter table public.payment_sessions enable row level security;
alter table public.payment_events enable row level security;

create policy "XSHOP customers read configured payment methods" on public.payment_methods for select to anon, authenticated
using (status = 'active' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now()));
create policy "XSHOP payment admins manage methods" on public.payment_methods for all to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])))
with check ((select private.user_has_any_role(array['admin', 'super_admin'])));

create policy "XSHOP customers and payment admins read payment sessions" on public.payment_sessions for select to authenticated
using (customer_id = (select auth.uid()) or (select private.user_has_any_role(array['admin', 'super_admin'])));
create policy "XSHOP customers and payment admins read payment events" on public.payment_events for select to authenticated
using (exists (
  select 1 from public.payment_sessions as session
  where session.id = payment_events.session_id
    and (session.customer_id = (select auth.uid()) or (select private.user_has_any_role(array['admin', 'super_admin'])))
));

revoke all on public.payment_methods, public.payment_sessions, public.payment_events from anon, authenticated;
grant select on public.payment_methods to anon, authenticated;
grant select on public.payment_sessions, public.payment_events to authenticated;

create or replace function public.create_payment_session(_order_id uuid, _method_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer uuid := (select auth.uid());
  order_record public.orders%rowtype;
  method_record public.payment_methods%rowtype;
  active_session public.payment_sessions%rowtype;
  session_key uuid;
  quoted_amount numeric(38, 18);
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;

  select * into order_record from public.orders as order_row
  where order_row.id = _order_id and order_row.customer_id = customer
  for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  if order_record.payment_status = 'verified' then raise exception 'This order has already been paid.' using errcode = 'P0001'; end if;

  update public.payment_sessions as session
  set status = 'expired', updated_at = now()
  where session.order_id = _order_id and session.customer_id = customer
    and session.status = 'pending' and session.expires_at <= now();

  select * into active_session from public.payment_sessions as session
  where session.order_id = _order_id and session.customer_id = customer
    and session.status in ('pending', 'submitted') and session.expires_at > now()
  order by session.created_at desc limit 1;
  if found then
    if active_session.method_id <> _method_id then raise exception 'An active payment session already exists for this order.' using errcode = 'P0001'; end if;
    return active_session.id;
  end if;

  if order_record.payment_status not in ('unpaid', 'rejected', 'expired') then
    raise exception 'This order is not eligible for a new payment session.' using errcode = 'P0001';
  end if;
  select * into method_record from public.payment_methods as method
  where method.id = _method_id and method.fiat_currency_code = order_record.currency_code
    and method.status = 'active'
    and (method.starts_at is null or method.starts_at <= now())
    and (method.ends_at is null or method.ends_at > now());
  if not found then raise exception 'The selected payment method is unavailable.' using errcode = 'P0001'; end if;

  quoted_amount := ceil(order_record.total_amount * method_record.crypto_units_per_fiat * power(10::numeric, method_record.asset_decimals))
    / power(10::numeric, method_record.asset_decimals);
  if quoted_amount <= 0 then raise exception 'The configured quote produced an invalid amount.' using errcode = '22023'; end if;

  insert into public.payment_sessions (
    order_id, customer_id, method_id, asset_code, network_code, expected_amount,
    order_currency_code, receiving_address, asset_decimals, status, created_at, expires_at
  ) values (
    _order_id, customer, method_record.id, method_record.asset_code, method_record.network_code,
    quoted_amount, order_record.currency_code, method_record.receiving_address,
    method_record.asset_decimals, 'pending', now(), now() + interval '60 minutes'
  ) returning id into session_key;

  update public.orders set payment_status = 'pending' where id = _order_id;
  insert into public.payment_events (session_id, order_id, actor_id, event_type, from_status, to_status, details)
  values (session_key, _order_id, customer, 'created', null, 'pending', jsonb_build_object('asset', method_record.asset_code, 'network', method_record.network_code));
  return session_key;
end;
$$;

create or replace function public.submit_payment_transaction(_session_id uuid, _transaction_hash text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer uuid := (select auth.uid());
  session_record public.payment_sessions%rowtype;
  normalized_hash text;
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  normalized_hash := lower(regexp_replace(btrim(coalesce(_transaction_hash, '')), '^0x', '', 'i'));
  if normalized_hash !~ '^[a-f0-9]{64}$' then raise exception 'Enter a valid 64-character transaction hash.' using errcode = '22023'; end if;

  select * into session_record from public.payment_sessions as session
  where session.id = _session_id and session.customer_id = customer
  for update;
  if not found then raise exception 'Payment session not found.' using errcode = 'P0002'; end if;

  if session_record.status = 'submitted' and session_record.transaction_hash = normalized_hash then
    return jsonb_build_object('session_id', session_record.id, 'status', session_record.status);
  end if;
  if session_record.status <> 'pending' then
    return jsonb_build_object('session_id', session_record.id, 'status', session_record.status);
  end if;
  if session_record.expires_at <= now() then
    update public.payment_sessions set status = 'expired', updated_at = now() where id = _session_id;
    update public.orders set payment_status = 'expired' where id = session_record.order_id and payment_status = 'pending';
    insert into public.payment_events (session_id, order_id, actor_id, event_type, from_status, to_status)
    values (_session_id, session_record.order_id, customer, 'expired', 'pending', 'expired');
    return jsonb_build_object('session_id', _session_id, 'status', 'expired');
  end if;

  update public.payment_sessions
  set status = 'submitted', transaction_hash = normalized_hash, submitted_at = now(), updated_at = now()
  where id = _session_id;
  update public.orders set payment_status = 'submitted' where id = session_record.order_id;
  insert into public.payment_events (session_id, order_id, actor_id, event_type, from_status, to_status)
  values (_session_id, session_record.order_id, customer, 'transaction_submitted', 'pending', 'submitted');
  return jsonb_build_object('session_id', _session_id, 'status', 'submitted');
end;
$$;

create or replace function public.expire_my_payment_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer uuid := (select auth.uid());
  expired_count integer;
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;

  with changed as (
    update public.payment_sessions as session
    set status = 'expired', updated_at = now()
    where session.customer_id = customer and session.status = 'pending' and session.expires_at <= now()
    returning session.id, session.order_id
  ), events as (
    insert into public.payment_events (session_id, order_id, actor_id, event_type, from_status, to_status)
    select id, order_id, customer, 'expired', 'pending', 'expired' from changed
    returning order_id
  )
  update public.orders as order_row
  set payment_status = 'expired'
  where order_row.customer_id = customer and order_row.payment_status = 'pending'
    and order_row.id in (select order_id from events)
    and not exists (
      select 1 from public.payment_sessions as active
      where active.order_id = order_row.id and active.status in ('pending', 'submitted')
    );

  get diagnostics expired_count = row_count;
  return expired_count;
end;
$$;

create or replace function public.verify_payment_session(_session_id uuid, _approve boolean, _rejection_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_record public.payment_sessions%rowtype;
  customer uuid := (select auth.uid());
begin
  if customer is null or not (select private.user_has_any_role(array['admin', 'super_admin'])) then
    raise exception 'Not authorized to review payments.' using errcode = '42501';
  end if;
  if not _approve and char_length(btrim(coalesce(_rejection_reason, ''))) = 0 then
    raise exception 'A rejection reason is required.' using errcode = '22023';
  end if;

  select * into session_record from public.payment_sessions as session where session.id = _session_id for update;
  if not found then raise exception 'Payment session not found.' using errcode = 'P0002'; end if;
  if session_record.status in ('verified', 'rejected') then
    return jsonb_build_object('session_id', session_record.id, 'order_id', session_record.order_id, 'status', session_record.status);
  end if;
  if session_record.status <> 'submitted' or session_record.transaction_hash is null then
    raise exception 'Only a submitted transaction can be reviewed.' using errcode = 'P0001';
  end if;

  if _approve then
    update public.payment_sessions set status = 'verified', verified_at = now(), verified_by = customer, updated_at = now()
    where id = _session_id;
    update public.orders set payment_status = 'verified', fulfillment_status = 'eligible' where id = session_record.order_id;
    insert into public.payment_events (session_id, order_id, actor_id, event_type, from_status, to_status, details)
    values (_session_id, session_record.order_id, customer, 'verified', 'submitted', 'verified', jsonb_build_object('manual_review', true));
    return jsonb_build_object('session_id', _session_id, 'order_id', session_record.order_id, 'status', 'verified');
  end if;

  update public.payment_sessions set status = 'rejected', verified_by = customer,
    rejection_reason = left(btrim(_rejection_reason), 1000), updated_at = now()
  where id = _session_id;
  update public.orders set payment_status = 'rejected', fulfillment_status = 'not_eligible' where id = session_record.order_id;
  insert into public.payment_events (session_id, order_id, actor_id, event_type, from_status, to_status, details)
  values (_session_id, session_record.order_id, customer, 'rejected', 'submitted', 'rejected', jsonb_build_object('reason', left(btrim(_rejection_reason), 500)));
  return jsonb_build_object('session_id', _session_id, 'order_id', session_record.order_id, 'status', 'rejected');
end;
$$;

revoke all on function public.create_payment_session(uuid, uuid) from public;
revoke all on function public.submit_payment_transaction(uuid, text) from public;
revoke all on function public.expire_my_payment_sessions() from public;
revoke all on function public.verify_payment_session(uuid, boolean, text) from public;
grant execute on function public.create_payment_session(uuid, uuid) to authenticated;
grant execute on function public.submit_payment_transaction(uuid, text) to authenticated;
grant execute on function public.expire_my_payment_sessions() to authenticated;
grant execute on function public.verify_payment_session(uuid, boolean, text) to authenticated;

create trigger payment_methods_set_updated_at before update on public.payment_methods
for each row execute function private.set_updated_at();
create trigger payment_sessions_set_updated_at before update on public.payment_sessions
for each row execute function private.set_updated_at();

commit;
