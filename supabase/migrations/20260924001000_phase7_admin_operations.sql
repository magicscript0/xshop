-- XSHOP Phase 7/9: admin operations, store settings, privileged audit logging,
-- staff read access, and lightweight database-side rate limiting.
--
-- Additive only. No previous migration is rewritten and no data is destroyed.
-- No wallet addresses, products, customers, or analytics values are seeded.
-- All authorization is enforced by RLS/definer functions, never by the browser.

begin;

-- ---------------------------------------------------------------------------
-- 1. Staff read access (support/admin/super_admin) for order management.
--    Support is read-only: no grant or policy provides support with writes.
-- ---------------------------------------------------------------------------

drop policy if exists "XSHOP staff read all orders" on public.orders;
create policy "XSHOP staff read all orders"
on public.orders
for select
to authenticated
using ((select private.user_has_any_role(array['support', 'admin', 'super_admin'])));

drop policy if exists "XSHOP support reads order items" on public.order_items;
create policy "XSHOP support reads order items"
on public.order_items
for select
to authenticated
using ((select private.user_has_any_role(array['support'])));

drop policy if exists "XSHOP support reads customer profiles" on public.profiles;
create policy "XSHOP support reads customer profiles"
on public.profiles
for select
to authenticated
using ((select private.user_has_any_role(array['support'])));

-- Admins could already manage digital_inventory rows by policy, but the batch
-- registry itself had no read policy. Add explicit admin visibility (metadata
-- only; batch rows never contain delivery payloads).
drop policy if exists "XSHOP admins read inventory batches" on public.digital_inventory_batches;
create policy "XSHOP admins read inventory batches"
on public.digital_inventory_batches
for select
to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])));
grant select on public.digital_inventory_batches to authenticated;

-- Phase 5 granted only SELECT on payment_methods; the admin manage policy was
-- unreachable for writes. Allow writes through RLS (admin/super_admin only).
grant insert, update, delete on public.payment_methods to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Store settings: a small database-driven configuration layer.
--    Public rows are safe, non-secret storefront configuration only.
-- ---------------------------------------------------------------------------

create table if not exists public.store_settings (
  key text primary key check (key ~ '^[a-z0-9_.]{1,80}$'),
  value jsonb not null check (pg_column_size(value) <= 8192),
  description text check (description is null or char_length(description) <= 500),
  is_public boolean not null default false,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.store_settings is 'XSHOP configurable settings. Never store secrets, keys, or credentials here.';

alter table public.store_settings enable row level security;
revoke all on table public.store_settings from public, anon, authenticated;
grant select on public.store_settings to anon, authenticated;
grant insert, update, delete on public.store_settings to authenticated;

drop policy if exists "XSHOP public store settings read" on public.store_settings;
create policy "XSHOP public store settings read"
on public.store_settings
for select
to anon, authenticated
using (is_public);

drop policy if exists "XSHOP admins read all store settings" on public.store_settings;
create policy "XSHOP admins read all store settings"
on public.store_settings
for select
to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])));

drop policy if exists "XSHOP admins manage store settings" on public.store_settings;
create policy "XSHOP admins manage store settings"
on public.store_settings
for all
to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])))
with check ((select private.user_has_any_role(array['admin', 'super_admin'])));

drop trigger if exists store_settings_set_updated_at on public.store_settings;
create trigger store_settings_set_updated_at
before update on public.store_settings
for each row execute function private.set_updated_at();

-- Functional configuration defaults only (no store content is fabricated).
insert into public.store_settings (key, value, description, is_public) values
  ('inventory.low_stock_threshold', '5'::jsonb, 'Digital/tracked stock level at or below which an admin low-stock alert is raised.', false),
  ('rewards.enabled', 'true'::jsonb, 'Whether customers earn and redeem loyalty points.', true),
  ('rewards.earn_points_per_currency_unit', '1'::jsonb, 'Points earned per 1.00 of a verified order total.', true),
  ('rewards.redeem_points_per_currency_unit', '100'::jsonb, 'Points required to discount 1.00 from an order at checkout.', true),
  ('referrals.enabled', 'true'::jsonb, 'Whether referral codes can be applied and qualified.', true),
  ('referrals.reward_points', '100'::jsonb, 'Points granted to the referrer when a referral qualifies.', true),
  ('referrals.min_qualifying_order_total', '0'::jsonb, 'Minimum verified order total for a referral to qualify.', false)
on conflict (key) do nothing;

create or replace function private.get_setting_numeric(_key text, _default numeric)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when jsonb_typeof(setting.value) = 'number' then (setting.value #>> '{}')::numeric else null end
    from public.store_settings as setting where setting.key = _key
  ), _default);
$$;
revoke all on function private.get_setting_numeric(text, numeric) from public, anon;
grant execute on function private.get_setting_numeric(text, numeric) to authenticated;

create or replace function private.get_setting_bool(_key text, _default boolean)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case when jsonb_typeof(setting.value) = 'boolean' then (setting.value #>> '{}')::boolean else null end
    from public.store_settings as setting where setting.key = _key
  ), _default);
$$;
revoke all on function private.get_setting_bool(text, boolean) from public, anon;
grant execute on function private.get_setting_bool(text, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Admin audit log. Written only by trusted definer triggers/functions.
--    Digital inventory payloads are intentionally never audited or logged.
-- ---------------------------------------------------------------------------

create table if not exists public.admin_audit_log (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null check (char_length(action) between 1 and 80),
  entity_type text not null check (char_length(entity_type) between 1 and 80),
  entity_id text check (entity_id is null or char_length(entity_id) <= 120),
  previous_state jsonb,
  new_state jsonb,
  metadata jsonb not null default '{}'::jsonb check (pg_column_size(metadata) <= 4096),
  created_at timestamptz not null default now()
);
create index if not exists admin_audit_log_created_idx on public.admin_audit_log (created_at desc);
create index if not exists admin_audit_log_entity_idx on public.admin_audit_log (entity_type, entity_id);

alter table public.admin_audit_log enable row level security;
revoke all on table public.admin_audit_log from public, anon, authenticated;
grant select on public.admin_audit_log to authenticated;

drop policy if exists "XSHOP admins read the audit log" on public.admin_audit_log;
create policy "XSHOP admins read the audit log"
on public.admin_audit_log
for select
to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])));

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  prev jsonb;
  next jsonb;
begin
  if tg_op in ('UPDATE', 'DELETE') then prev := to_jsonb(old); end if;
  if tg_op in ('INSERT', 'UPDATE') then next := to_jsonb(new); end if;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, previous_state, new_state)
  values (
    (select auth.uid()),
    lower(tg_op),
    tg_table_name,
    coalesce(next ->> 'id', prev ->> 'id', next ->> 'key', prev ->> 'key'),
    prev,
    next
  );

  return coalesce(new, old);
end;
$$;
revoke all on function private.audit_row_change() from public, anon, authenticated;

-- Catalog/payment/settings management is admin-gated by RLS, so these triggers
-- audit privileged changes. Inventory tables are excluded on purpose: their
-- rows contain delivery payloads that must never be copied into logs.
drop trigger if exists products_audit on public.products;
create trigger products_audit after insert or update or delete on public.products
for each row execute function private.audit_row_change();

drop trigger if exists product_variants_audit on public.product_variants;
create trigger product_variants_audit after insert or update or delete on public.product_variants
for each row execute function private.audit_row_change();

drop trigger if exists product_prices_audit on public.product_prices;
create trigger product_prices_audit after insert or update or delete on public.product_prices
for each row execute function private.audit_row_change();

drop trigger if exists product_deals_audit on public.product_deals;
create trigger product_deals_audit after insert or update or delete on public.product_deals
for each row execute function private.audit_row_change();

drop trigger if exists categories_audit on public.categories;
create trigger categories_audit after insert or update or delete on public.categories
for each row execute function private.audit_row_change();

drop trigger if exists payment_methods_audit on public.payment_methods;
create trigger payment_methods_audit after insert or update or delete on public.payment_methods
for each row execute function private.audit_row_change();

drop trigger if exists store_settings_audit on public.store_settings;
create trigger store_settings_audit after insert or update or delete on public.store_settings
for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- 4. Role management. Only a super_admin may change roles; self-promotion and
--    self-demotion are both refused so an actor can never alter their own row.
-- ---------------------------------------------------------------------------

create or replace function public.admin_set_user_role(_user_id uuid, _new_role text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  previous_role text;
begin
  if actor is null or not (select private.user_has_any_role(array['super_admin'])) then
    raise exception 'Not authorized to manage roles.' using errcode = '42501';
  end if;
  if _user_id is null or _user_id = actor then
    raise exception 'You cannot change your own role.' using errcode = '22023';
  end if;
  if _new_role is null or _new_role not in ('customer', 'support', 'admin', 'super_admin') then
    raise exception 'Choose a valid role.' using errcode = '22023';
  end if;

  select role into previous_role from public.profiles where id = _user_id for update;
  if not found then raise exception 'Profile not found.' using errcode = 'P0002'; end if;
  if previous_role = _new_role then return; end if;

  update public.profiles set role = _new_role where id = _user_id;

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, previous_state, new_state)
  values (actor, 'role_change', 'profiles', _user_id::text,
    jsonb_build_object('role', previous_role), jsonb_build_object('role', _new_role));
end;
$$;
revoke all on function public.admin_set_user_role(uuid, text) from public, anon;
grant execute on function public.admin_set_user_role(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 5. Admin inventory summary and controlled invalidation.
--    Counts only; delivery payloads are never returned by these functions.
-- ---------------------------------------------------------------------------

create or replace function public.admin_inventory_summary()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  threshold numeric := private.get_setting_numeric('inventory.low_stock_threshold', 5);
  digital jsonb;
  tracked jsonb;
begin
  if (select auth.uid()) is null or not (select private.user_has_any_role(array['admin', 'super_admin'])) then
    raise exception 'Not authorized to view inventory.' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(row_data order by row_data ->> 'product_name'), '[]'::jsonb) into digital
  from (
    select jsonb_build_object(
      'price_id', price.id,
      'product_id', product.id,
      'product_name', product.name,
      'product_status', product.status,
      'variant_name', variant.variant_name,
      'available', count(*) filter (where inventory.status = 'available'),
      'reserved', count(*) filter (where inventory.status = 'reserved'),
      'assigned', count(*) filter (where inventory.status = 'assigned'),
      'void', count(*) filter (where inventory.status = 'void'),
      'low_stock', count(*) filter (where inventory.status = 'available') <= threshold
    ) as row_data
    from public.product_prices as price
    join public.products as product on product.id = price.product_id
    left join public.product_variants as variant on variant.id = price.variant_id
    left join public.digital_inventory as inventory on inventory.product_price_id = price.id
    where price.availability_mode = 'digital'
    group by price.id, product.id, product.name, product.status, variant.variant_name
  ) as digital_rows;

  select coalesce(jsonb_agg(row_data order by row_data ->> 'product_name'), '[]'::jsonb) into tracked
  from (
    select jsonb_build_object(
      'price_id', price.id,
      'product_id', product.id,
      'product_name', product.name,
      'product_status', product.status,
      'variant_name', variant.variant_name,
      'stock_on_hand', price.stock_on_hand,
      'low_stock', price.stock_on_hand <= threshold
    ) as row_data
    from public.product_prices as price
    join public.products as product on product.id = price.product_id
    left join public.product_variants as variant on variant.id = price.variant_id
    where price.availability_mode = 'tracked'
  ) as tracked_rows;

  return jsonb_build_object('threshold', threshold, 'digital', digital, 'tracked', tracked);
end;
$$;
revoke all on function public.admin_inventory_summary() from public, anon;
grant execute on function public.admin_inventory_summary() to authenticated;

create or replace function public.admin_void_inventory_item(_inventory_id uuid, _reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
begin
  if actor is null or not (select private.user_has_any_role(array['admin', 'super_admin'])) then
    raise exception 'Not authorized to manage inventory.' using errcode = '42501';
  end if;
  if char_length(btrim(coalesce(_reason, ''))) = 0 then
    raise exception 'A reason is required to invalidate inventory.' using errcode = '22023';
  end if;

  update public.digital_inventory
  set status = 'void', reserved_order_id = null, reserved_order_item_id = null,
    reserved_payment_session_id = null, reservation_expires_at = null
  where id = _inventory_id and status = 'available';
  if not found then
    raise exception 'Only an available inventory item can be invalidated.' using errcode = 'P0001';
  end if;

  -- The payload itself is deliberately not logged.
  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor, 'inventory_void', 'digital_inventory', _inventory_id::text,
    jsonb_build_object('reason', left(btrim(_reason), 500)));
end;
$$;
revoke all on function public.admin_void_inventory_item(uuid, text) from public, anon;
grant execute on function public.admin_void_inventory_item(uuid, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Lightweight database-side rate limiting (no new dependency).
--    Fixed windows per action per identity; enforced by BEFORE triggers so it
--    also covers every path into the underlying tables.
-- ---------------------------------------------------------------------------

create table if not exists private.rate_limits (
  bucket_key text not null,
  window_start timestamptz not null,
  event_count integer not null default 0,
  primary key (bucket_key, window_start)
);
revoke all on table private.rate_limits from public, anon, authenticated;

create or replace function private.consume_rate_limit(_action text, _max_events integer, _window_seconds integer)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor text := coalesce((select auth.uid())::text, 'anon');
  bucket text := _action || ':' || actor;
  slot timestamptz := to_timestamp(floor(extract(epoch from now()) / _window_seconds) * _window_seconds);
  current_count integer;
begin
  insert into private.rate_limits as rl (bucket_key, window_start, event_count)
  values (bucket, slot, 1)
  on conflict (bucket_key, window_start)
  do update set event_count = rl.event_count + 1
  returning event_count into current_count;

  if current_count > _max_events then
    raise exception 'Too many requests. Please wait a moment and try again.' using errcode = '54000';
  end if;

  -- Opportunistic cleanup keeps the table tiny without a scheduler.
  if random() < 0.02 then
    delete from private.rate_limits where window_start < now() - interval '2 days';
  end if;
end;
$$;
revoke all on function private.consume_rate_limit(text, integer, integer) from public, anon, authenticated;

create or replace function private.rate_limit_row_trigger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.consume_rate_limit(tg_argv[0], tg_argv[1]::integer, tg_argv[2]::integer);
  return new;
end;
$$;
revoke all on function private.rate_limit_row_trigger() from public, anon, authenticated;

drop trigger if exists orders_rate_limit on public.orders;
create trigger orders_rate_limit before insert on public.orders
for each row execute function private.rate_limit_row_trigger('order_create', '15', '600');

drop trigger if exists payment_sessions_rate_limit on public.payment_sessions;
create trigger payment_sessions_rate_limit before insert on public.payment_sessions
for each row execute function private.rate_limit_row_trigger('payment_session_create', '20', '600');

drop trigger if exists payment_tx_submit_rate_limit on public.payment_sessions;
create trigger payment_tx_submit_rate_limit before update of transaction_hash on public.payment_sessions
for each row
when (new.transaction_hash is distinct from old.transaction_hash)
execute function private.rate_limit_row_trigger('payment_tx_submit', '10', '600');

drop trigger if exists cart_items_rate_limit on public.cart_items;
create trigger cart_items_rate_limit before insert on public.cart_items
for each row execute function private.rate_limit_row_trigger('cart_add', '120', '600');

drop trigger if exists inventory_import_rate_limit on public.digital_inventory_batches;
create trigger inventory_import_rate_limit before insert on public.digital_inventory_batches
for each row execute function private.rate_limit_row_trigger('inventory_import', '30', '3600');

commit;
