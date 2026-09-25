-- XSHOP Phase 9: premium marketplace gaps.
--
-- Additive only. No previous migration is rewritten and no data is destroyed.
-- No products, prices, wallets, or customer data are seeded.
--
-- Contents:
--   1. Product merchandising columns (provider, featured, terms, redemption,
--      region, delivery method/ETA, per-product low-stock threshold).
--   2. Payment-method configurability (instructions, minimum order amount,
--      per-method session expiry, display order) + session creation honors it.
--   3. Payment review workflow: under-review flag + internal notes (audited).
--   4. Human-readable order numbers (random, non-sequential).
--   5. Coupon scoping to products / categories with server-side line math.
--   6. Catalog: deal end timestamps, provider/denomination/worldwide/featured
--      filters, discount + availability sorts.
--   7. Reusable email templates + fulfillment-outbox enrichment + admin
--      outbox visibility (metadata; a sender worker is still configured
--      separately — see docs/OPERATIONS.md).
--   8. Configurable legal + support store settings (empty = unconfigured).
--
-- Product-safety note: nothing here introduces, detects, validates, or stores
-- payment-card credentials. Coupon/inventory payloads remain lawful digital
-- goods handled through the existing authorized paths only.

begin;

-- ---------------------------------------------------------------------------
-- 1. Product merchandising columns. All nullable / defaulted so existing rows
--    are untouched. Every new column is non-sensitive display copy.
-- ---------------------------------------------------------------------------

alter table public.products
  add column if not exists provider_name text
    check (provider_name is null or char_length(btrim(provider_name)) between 1 and 120),
  add column if not exists featured boolean not null default false,
  add column if not exists terms text
    check (terms is null or char_length(terms) <= 12000),
  add column if not exists redemption_instructions text
    check (redemption_instructions is null or char_length(redemption_instructions) <= 12000),
  add column if not exists region_restrictions text
    check (region_restrictions is null or char_length(region_restrictions) <= 2000),
  add column if not exists delivery_method text
    check (delivery_method is null or char_length(btrim(delivery_method)) between 1 and 200),
  add column if not exists delivery_eta text
    check (delivery_eta is null or char_length(btrim(delivery_eta)) between 1 and 200),
  add column if not exists low_stock_threshold integer
    check (low_stock_threshold is null or low_stock_threshold >= 0);

comment on column public.products.provider_name is 'Brand / provider display name entered by the store admin.';
comment on column public.products.featured is 'Featured listings sort first in relevance ordering.';
comment on column public.products.low_stock_threshold is 'Optional per-product override of the inventory.low_stock_threshold setting.';

create index if not exists products_featured_idx on public.products (featured)
  where status = 'active' and visibility = 'public';

-- ---------------------------------------------------------------------------
-- 2. Configurable payment methods. Session creation honors the per-method
--    minimum order amount and expiry window using the database clock.
-- ---------------------------------------------------------------------------

alter table public.payment_methods
  add column if not exists instructions text
    check (instructions is null or char_length(instructions) <= 2000),
  add column if not exists min_order_amount numeric(14, 2)
    check (min_order_amount is null or min_order_amount >= 0),
  add column if not exists expires_after_minutes integer not null default 60
    check (expires_after_minutes between 5 and 1440),
  add column if not exists display_order integer not null default 0;

comment on column public.payment_methods.instructions is 'Customer-facing payment instructions shown with the session.';
comment on column public.payment_methods.min_order_amount is 'Minimum order total (fiat) eligible for this method; null means no minimum.';
comment on column public.payment_methods.expires_after_minutes is 'Session lifetime in minutes, enforced with the database clock.';

create index if not exists payment_methods_display_idx
  on public.payment_methods (fiat_currency_code, status, display_order);

-- Same signature as Phase 6: CREATE OR REPLACE keeps grants and callers intact.
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
  expiration timestamptz;
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  perform private.expire_stale_payment_sessions();
  select * into order_record from public.orders as order_row
  where order_row.id = _order_id and order_row.customer_id = customer for update;
  if not found then raise exception 'Order not found.' using errcode = 'P0002'; end if;
  if order_record.payment_status = 'verified' then raise exception 'This order has already been paid.' using errcode = 'P0001'; end if;


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

  if method_record.min_order_amount is not null and order_record.total_amount < method_record.min_order_amount then
    raise exception 'This order total is below the minimum for the selected payment method.' using errcode = 'P0001';
  end if;
  expiration := now() + make_interval(mins => method_record.expires_after_minutes);

  quoted_amount := ceil(order_record.total_amount * method_record.crypto_units_per_fiat * power(10::numeric, method_record.asset_decimals))
    / power(10::numeric, method_record.asset_decimals);
  if quoted_amount <= 0 then raise exception 'The configured quote produced an invalid amount.' using errcode = '22023'; end if;

  insert into public.payment_sessions (
    order_id, customer_id, method_id, asset_code, network_code, expected_amount,
    order_currency_code, receiving_address, asset_decimals, status, created_at, expires_at
  ) values (
    _order_id, customer, method_record.id, method_record.asset_code, method_record.network_code,
    quoted_amount, order_record.currency_code, method_record.receiving_address,
    method_record.asset_decimals, 'pending', now(), expiration
  ) returning id into session_key;

  perform private.reserve_order_inventory(_order_id, session_key, expiration);
  update public.orders set payment_status = 'pending', fulfillment_status = 'not_eligible' where id = _order_id;
  insert into public.payment_events (session_id, order_id, actor_id, event_type, from_status, to_status, details)
  values (session_key, _order_id, customer, 'created', null, 'pending', jsonb_build_object('asset', method_record.asset_code, 'network', method_record.network_code));
  return session_key;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Payment review aids: an under-review flag plus internal notes.
--    The payment status machine itself is unchanged, so reservation and
--    expiry behavior from Phases 5/6 is preserved exactly.
-- ---------------------------------------------------------------------------

alter table public.payment_sessions
  add column if not exists review_state text not null default 'none'
    check (review_state in ('none', 'under_review'));

comment on column public.payment_sessions.review_state is 'Staff-only review marker; the customer-facing status machine is unchanged.';

create table if not exists public.payment_review_notes (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references public.payment_sessions(id) on delete restrict,
  order_id uuid not null references public.orders(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  note text not null check (char_length(note) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists payment_review_notes_session_idx
  on public.payment_review_notes (session_id, created_at);

comment on table public.payment_review_notes is 'Staff-only internal payment review notes. Never exposed to customers.';

alter table public.payment_review_notes enable row level security;
revoke all on public.payment_review_notes from public, anon, authenticated;
grant select on public.payment_review_notes to authenticated;

drop policy if exists "XSHOP payment admins read review notes" on public.payment_review_notes;
create policy "XSHOP payment admins read review notes"
on public.payment_review_notes
for select
to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])));

-- Extend the payment-event vocabulary for review actions (additive). Phase 5 declared
-- the check inline, so PostgreSQL auto-named it payment_events_event_type_check.
alter table public.payment_events drop constraint if exists payment_events_event_type_check;

alter table public.payment_events add constraint payment_events_event_type_check
  check (event_type in ('created', 'transaction_submitted', 'verified', 'rejected', 'expired', 'note_added', 'review_state_changed'));

create or replace function public.admin_add_payment_note(_session_id uuid, _note text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  session_record public.payment_sessions%rowtype;
  clean text := btrim(coalesce(_note, ''));
  note_id uuid;
begin
  if actor is null or not (select private.user_has_any_role(array['admin', 'super_admin'])) then
    raise exception 'Not authorized to add payment notes.' using errcode = '42501';
  end if;
  if char_length(clean) < 1 or char_length(clean) > 2000 then
    raise exception 'Enter an internal note between 1 and 2000 characters.' using errcode = '22023';
  end if;

  select * into session_record from public.payment_sessions as session
  where session.id = _session_id for update;
  if not found then raise exception 'Payment session not found.' using errcode = 'P0002'; end if;

  insert into public.payment_review_notes (session_id, order_id, actor_id, note)
  values (_session_id, session_record.order_id, actor, clean)
  returning id into note_id;

  insert into public.payment_events (session_id, order_id, actor_id, event_type, from_status, to_status, details)
  values (_session_id, session_record.order_id, actor, 'note_added',
    session_record.status, session_record.status, jsonb_build_object('note_preview', left(clean, 300)));

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, new_state)
  values (actor, 'payment_note', 'payment_sessions', _session_id::text,
    jsonb_build_object('session_id', _session_id, 'order_id', session_record.order_id));

  return note_id;
end;
$$;
revoke all on function public.admin_add_payment_note(uuid, text) from public, anon;
grant execute on function public.admin_add_payment_note(uuid, text) to authenticated;

create or replace function public.admin_set_payment_review_state(_session_id uuid, _review_state text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  session_record public.payment_sessions%rowtype;
begin
  if actor is null or not (select private.user_has_any_role(array['admin', 'super_admin'])) then
    raise exception 'Not authorized to review payments.' using errcode = '42501';
  end if;
  if _review_state is null or _review_state not in ('none', 'under_review') then
    raise exception 'Choose a valid review state.' using errcode = '22023';
  end if;

  select * into session_record from public.payment_sessions as session
  where session.id = _session_id for update;
  if not found then raise exception 'Payment session not found.' using errcode = 'P0002'; end if;
  if session_record.status not in ('pending', 'submitted') then
    raise exception 'Only a live payment session can be marked for review.' using errcode = 'P0001';
  end if;
  if session_record.review_state = _review_state then return session_record.review_state; end if;

  update public.payment_sessions set review_state = _review_state, updated_at = now()
  where id = _session_id;

  insert into public.payment_events (session_id, order_id, actor_id, event_type, from_status, to_status, details)
  values (_session_id, session_record.order_id, actor, 'review_state_changed',
    session_record.status, session_record.status,
    jsonb_build_object('from_review_state', session_record.review_state, 'to_review_state', _review_state));

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, previous_state, new_state)
  values (actor, 'payment_review_state', 'payment_sessions', _session_id::text,
    jsonb_build_object('review_state', session_record.review_state),
    jsonb_build_object('review_state', _review_state));

  return _review_state;
end;
$$;
revoke all on function public.admin_set_payment_review_state(uuid, text) from public, anon;
grant execute on function public.admin_set_payment_review_state(uuid, text) to authenticated;

drop trigger if exists payment_review_notes_audit on public.payment_review_notes;
create trigger payment_review_notes_audit after insert or update or delete on public.payment_review_notes
for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- 4. Human-readable order numbers. Random and non-sequential so they cannot
--    be enumerated; ownership checks still apply on every read.
-- ---------------------------------------------------------------------------

create or replace function private.generate_order_number()
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare candidate text;
begin
  loop
    candidate := 'XS-' || upper(substr(md5(gen_random_uuid()::text || clock_timestamp()::text || random()::text), 1, 8));
    if not exists (select 1 from public.orders as existing where existing.order_number = candidate) then
      return candidate;
    end if;
  end loop;
end;
$$;
revoke all on function private.generate_order_number() from public, anon, authenticated;

alter table public.orders add column if not exists order_number text;

do $$
declare order_row record;
begin
  for order_row in select id from public.orders where order_number is null order by created_at
  loop
    update public.orders set order_number = private.generate_order_number() where id = order_row.id;
  end loop;
end $$;

alter table public.orders alter column order_number set default private.generate_order_number();
alter table public.orders alter column order_number set not null;
create unique index if not exists orders_order_number_unique on public.orders (order_number);

comment on column public.orders.order_number is 'Customer-facing order reference (e.g. XS-3F9A2C1B). Random, non-sequential, unique.';

-- ---------------------------------------------------------------------------
-- 5. Coupon scoping. A coupon with no scope rows stays order-wide (existing
--    behavior). A coupon with scope rows discounts only matching lines, and
--    the eligible amount is computed from server-side order lines — never
--    from browser math.
-- ---------------------------------------------------------------------------

create table if not exists public.coupon_products (
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coupon_id, product_id)
);
create index if not exists coupon_products_product_idx on public.coupon_products (product_id, coupon_id);

create table if not exists public.coupon_categories (
  coupon_id uuid not null references public.coupons(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (coupon_id, category_id)
);
create index if not exists coupon_categories_category_idx on public.coupon_categories (category_id, coupon_id);

comment on table public.coupon_products is 'Coupon scope: covered products. Empty scope on a coupon means order-wide.';
comment on table public.coupon_categories is 'Coupon scope: covered categories (all current and future member products).';

alter table public.coupon_products enable row level security;
alter table public.coupon_categories enable row level security;
revoke all on public.coupon_products, public.coupon_categories from public, anon, authenticated;
grant select, insert, update, delete on public.coupon_products, public.coupon_categories to authenticated;

-- Scope rows are never publicly enumerable; validation happens through RPCs.
drop policy if exists "XSHOP admins manage coupon product scope" on public.coupon_products;
create policy "XSHOP admins manage coupon product scope"
on public.coupon_products
for all
to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])))
with check ((select private.user_has_any_role(array['admin', 'super_admin'])));

drop policy if exists "XSHOP admins manage coupon category scope" on public.coupon_categories;
create policy "XSHOP admins manage coupon category scope"
on public.coupon_categories
for all
to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])))
with check ((select private.user_has_any_role(array['admin', 'super_admin'])));

drop trigger if exists coupon_products_audit on public.coupon_products;
create trigger coupon_products_audit after insert or update or delete on public.coupon_products
for each row execute function private.audit_row_change();

drop trigger if exists coupon_categories_audit on public.coupon_categories;
create trigger coupon_categories_audit after insert or update or delete on public.coupon_categories
for each row execute function private.audit_row_change();

create or replace function private.coupon_is_scoped(_coupon_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.coupon_products where coupon_id = _coupon_id)
      or exists (select 1 from public.coupon_categories where coupon_id = _coupon_id);
$$;
revoke all on function private.coupon_is_scoped(uuid) from public, anon, authenticated;

create or replace function private.coupon_covers_product(_coupon_id uuid, _product_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not private.coupon_is_scoped(_coupon_id)
    or exists (
      select 1 from public.coupon_products as scope
      where scope.coupon_id = _coupon_id and scope.product_id = _product_id
    )
    or exists (
      select 1
      from public.coupon_categories as scope
      join public.product_categories as link on link.category_id = scope.category_id
      where scope.coupon_id = _coupon_id and link.product_id = _product_id
    );
$$;
revoke all on function private.coupon_covers_product(uuid, uuid) from public, anon, authenticated;

-- The previous numeric-eligible-amount signature is replaced so RPC name
-- resolution stays exact (same pattern Phase 8 used for order creation).
drop function if exists private.evaluate_coupon(uuid, text, text, numeric);

create or replace function private.evaluate_coupon(
  _customer uuid,
  _code text,
  _currency text,
  _lines jsonb,
  out coupon_id uuid,
  out discount numeric
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  normalized text := upper(btrim(coalesce(_code, '')));
  coupon_record public.coupons%rowtype;
  used_total integer;
  used_by_customer integer;
  eligible numeric(14, 2) := 0;
  line jsonb;
begin
  if normalized !~ '^[A-Z0-9][A-Z0-9_-]{2,39}$' then
    raise exception 'Enter a valid coupon code.' using errcode = '22023';
  end if;

  select * into coupon_record from public.coupons
  where code = normalized and status = 'active'
    and (starts_at is null or starts_at <= now())
    and (ends_at is null or ends_at > now());
  if not found then
    raise exception 'This coupon code is not valid.' using errcode = 'P0001';
  end if;

  if coupon_record.discount_type = 'amount' and coupon_record.currency_code <> _currency then
    raise exception 'This coupon cannot be used with this order currency.' using errcode = 'P0001';
  end if;

  -- Eligible amount from server-side lines: [{product_id, line_total}].
  -- Unscoped coupons cover every line; scoped coupons cover matching lines.
  if _lines is not null and jsonb_typeof(_lines) = 'array' then
    for line in select value from jsonb_array_elements(_lines)
    loop
      begin
        if private.coupon_covers_product(coupon_record.id, (line ->> 'product_id')::uuid) then
          eligible := eligible + coalesce((line ->> 'line_total')::numeric, 0);
        end if;
      exception when others then
        raise exception 'Coupon evaluation received invalid order lines.' using errcode = '22023';
      end;
    end loop;
  end if;
  eligible := round(coalesce(eligible, 0), 2);
  if eligible <= 0 then
    raise exception 'This coupon does not apply to this order.' using errcode = 'P0001';
  end if;

  if coupon_record.min_order_amount is not null and eligible < coupon_record.min_order_amount then
    raise exception 'This order does not meet the coupon minimum.' using errcode = 'P0001';
  end if;

  select count(*) into used_total from public.coupon_redemptions
  where coupon_redemptions.coupon_id = coupon_record.id and status in ('applied', 'confirmed');
  if coupon_record.usage_limit is not null and used_total >= coupon_record.usage_limit then
    raise exception 'This coupon has reached its usage limit.' using errcode = 'P0001';
  end if;

  select count(*) into used_by_customer from public.coupon_redemptions
  where coupon_redemptions.coupon_id = coupon_record.id and customer_id = _customer and status in ('applied', 'confirmed');
  if used_by_customer >= coupon_record.per_customer_limit then
    raise exception 'You have already used this coupon.' using errcode = 'P0001';
  end if;

  if coupon_record.discount_type = 'percent' then
    discount := round(eligible * coupon_record.discount_value / 100, 2);
  else
    discount := least(coupon_record.discount_value, eligible);
  end if;
  if coupon_record.max_discount_amount is not null then
    discount := least(discount, coupon_record.max_discount_amount);
  end if;
  discount := least(round(discount, 2), eligible);
  if discount <= 0 then
    raise exception 'This coupon does not apply to this order.' using errcode = 'P0001';
  end if;

  coupon_id := coupon_record.id;
end;
$$;
revoke all on function private.evaluate_coupon(uuid, text, text, jsonb) from public, anon, authenticated;

create or replace function public.preview_coupon(_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer uuid := (select auth.uid());
  cart_total numeric;
  cart_currency text;
  currency_count integer;
  cart_lines jsonb;
  evaluated record;
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  perform private.consume_rate_limit('coupon_preview', 30, 600);

  select
    sum(offer.current_price * item.quantity),
    min(product.currency_code),
    count(distinct product.currency_code),
    jsonb_agg(jsonb_build_object(
      'product_id', product.id,
      'line_total', round(offer.current_price * item.quantity, 2)
    ))
  into cart_total, cart_currency, currency_count, cart_lines
  from public.carts as cart
  join public.cart_items as item on item.cart_id = cart.id
  join public.products as product on product.id = item.product_id
  join public.catalog_current_offers as offer
    on offer.product_id = item.product_id and offer.variant_id is not distinct from item.variant_id
  where cart.customer_id = customer;

  if cart_total is null or cart_total <= 0 then
    raise exception 'Add items to your cart before applying a coupon.' using errcode = 'P0001';
  end if;
  if currency_count > 1 then
    raise exception 'All items in an order must use the same currency.' using errcode = '22023';
  end if;

  select * into evaluated from private.evaluate_coupon(customer, _code, cart_currency, coalesce(cart_lines, '[]'::jsonb));
  return jsonb_build_object(
    'code', upper(btrim(_code)),
    'discount', evaluated.discount,
    'currency_code', cart_currency,
    'estimated_total', greatest(0, cart_total - evaluated.discount)
  );
end;
$$;

-- create_order_from_cart keeps its Phase 8 signature; only the coupon block
-- changes (server-side scoped lines) plus order_number in every response.
create or replace function public.create_order_from_cart(
  _contact_email text,
  _idempotency_key uuid,
  _coupon_code text default null,
  _redeem_points integer default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer uuid := (select auth.uid());
  existing_order public.orders%rowtype;
  cart_key uuid;
  item_record record;
  offer record;
  product_record public.products%rowtype;
  order_key uuid;
  order_currency text;
  subtotal numeric(14,2) := 0;
  discount_total numeric(14,2) := 0;
  total_amount numeric(14,2) := 0;
  snapshot_subtotal numeric(14,2) := 0;
  snapshot_discount_total numeric(14,2) := 0;
  snapshot_total numeric(14,2) := 0;
  unit_discount numeric(14,2);
  coupon_key uuid;
  coupon_code_clean text := nullif(upper(btrim(coalesce(_coupon_code, ''))), '');
  coupon_discount numeric(14,2) := 0;
  coupon_lines jsonb;
  redeem_points integer := coalesce(_redeem_points, 0);
  reward_discount numeric(14,2) := 0;
  redeem_rate numeric;
  reward_balance bigint;
  remaining numeric(14,2);
  final_total numeric(14,2);
  order_number_value text;
  evaluated record;
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  if _idempotency_key is null then raise exception 'An idempotency key is required.' using errcode = '22023'; end if;
  if redeem_points < 0 or redeem_points > 10000000 then
    raise exception 'Enter a valid number of points to redeem.' using errcode = '22023';
  end if;
  if _contact_email is null or char_length(btrim(_contact_email)) > 320 or btrim(_contact_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid delivery/contact email.' using errcode = '22023';
  end if;

  select * into existing_order from public.orders
  where customer_id = customer and idempotency_key = _idempotency_key;
  if found then
    return jsonb_build_object('order_id', existing_order.id, 'order_number', existing_order.order_number, 'currency_code', existing_order.currency_code, 'subtotal', existing_order.subtotal_amount, 'discount_total', existing_order.discount_amount, 'coupon_discount', existing_order.coupon_discount_amount, 'reward_discount', existing_order.reward_discount_amount, 'total', existing_order.total_amount, 'payment_status', existing_order.payment_status, 'fulfillment_status', existing_order.fulfillment_status);
  end if;

  select cart.id into cart_key from public.carts as cart where cart.customer_id = customer for update;
  -- Recheck after locking the cart so concurrent retries with the same key return
  -- the order created by the transaction that acquired the lock first.
  select * into existing_order from public.orders
  where customer_id = customer and idempotency_key = _idempotency_key;
  if found then
    return jsonb_build_object('order_id', existing_order.id, 'order_number', existing_order.order_number, 'currency_code', existing_order.currency_code, 'subtotal', existing_order.subtotal_amount, 'discount_total', existing_order.discount_amount, 'coupon_discount', existing_order.coupon_discount_amount, 'reward_discount', existing_order.reward_discount_amount, 'total', existing_order.total_amount, 'payment_status', existing_order.payment_status, 'fulfillment_status', existing_order.fulfillment_status);
  end if;
  if cart_key is null then raise exception 'Your cart is empty.' using errcode = 'P0001'; end if;
  if not exists (select 1 from public.cart_items as item where item.cart_id = cart_key) then raise exception 'Your cart is empty.' using errcode = 'P0001'; end if;

  for item_record in
    select item.* from public.cart_items as item where item.cart_id = cart_key order by item.created_at for update
  loop
    select * into offer from public.catalog_current_offers as current_offer
    where current_offer.product_id = item_record.product_id and current_offer.variant_id is not distinct from item_record.variant_id;
    if not found or not offer.is_available then raise exception 'A cart item is no longer available.' using errcode = 'P0001'; end if;

    select product.* into product_record from public.products as product
    where product.id = item_record.product_id and product.status = 'active' and product.visibility = 'public' and product.resale_rights_verified
    for share;
    if not found then raise exception 'A cart item is no longer published.' using errcode = 'P0001'; end if;

    perform 1 from public.product_prices as price where price.id = offer.price_id for share;
    if offer.availability_mode = 'tracked' and not exists (
      select 1 from public.product_prices as price where price.id = offer.price_id and price.stock_on_hand >= item_record.quantity
    ) then raise exception 'A cart item no longer has the requested quantity.' using errcode = 'P0001'; end if;

    if order_currency is null then order_currency := product_record.currency_code;
    elsif order_currency <> product_record.currency_code then raise exception 'All items in an order must use the same currency.' using errcode = '22023';
    end if;

    unit_discount := greatest(0, offer.original_price - offer.current_price);
    subtotal := subtotal + offer.original_price * item_record.quantity;
    discount_total := discount_total + unit_discount * item_record.quantity;
    total_amount := total_amount + offer.current_price * item_record.quantity;
  end loop;

  if total_amount <= 0 then
    raise exception 'Zero-total orders cannot use the configured crypto checkout.' using errcode = 'P0001';
  end if;

  insert into public.orders (customer_id, idempotency_key, contact_email, currency_code, subtotal_amount, discount_amount, total_amount)
  values (customer, _idempotency_key, lower(btrim(_contact_email)), order_currency, subtotal, discount_total, total_amount)
  returning id into order_key;

  for item_record in
    select item.* from public.cart_items as item where item.cart_id = cart_key order by item.created_at
  loop
    select * into offer from public.catalog_current_offers as current_offer
    where current_offer.product_id = item_record.product_id and current_offer.variant_id is not distinct from item_record.variant_id;
    select product.* into product_record from public.products as product where product.id = item_record.product_id;
    snapshot_subtotal := snapshot_subtotal + offer.original_price * item_record.quantity;
    snapshot_discount_total := snapshot_discount_total + greatest(0, offer.original_price - offer.current_price) * item_record.quantity;
    snapshot_total := snapshot_total + offer.current_price * item_record.quantity;
    insert into public.order_items (
      order_id, product_id, product_price_id, variant_id, product_name_snapshot,
      variant_name_snapshot, sku_snapshot, denomination_value_snapshot,
      quantity, unit_price_amount, unit_discount_amount, line_total_amount, currency_code
    ) values (
      order_key, item_record.product_id, offer.price_id, item_record.variant_id, product_record.name,
      offer.variant_name, offer.sku, offer.denomination_value,
      item_record.quantity, offer.original_price, greatest(0, offer.original_price - offer.current_price),
      round(offer.current_price * item_record.quantity, 2), product_record.currency_code
    );
  end loop;

  if snapshot_total <= 0 then
    raise exception 'Zero-total orders cannot use the configured crypto checkout.' using errcode = 'P0001';
  end if;

  -- Server-side coupon validation over the immutable snapshots just written.
  -- Browser-calculated discounts are never trusted.
  if coupon_code_clean is not null then
    select coalesce(jsonb_agg(jsonb_build_object(
      'product_id', order_item.product_id,
      'line_total', order_item.line_total_amount
    )), '[]'::jsonb)
    into coupon_lines
    from public.order_items as order_item
    where order_item.order_id = order_key;
    select * into evaluated from private.evaluate_coupon(customer, coupon_code_clean, order_currency, coupon_lines);
    coupon_key := evaluated.coupon_id;
    coupon_discount := evaluated.discount;
  end if;

  remaining := snapshot_total - coupon_discount;

  -- Reward redemption against the immutable ledger, guarded by an advisory
  -- lock so concurrent checkouts cannot double-spend the same points.
  if redeem_points > 0 then
    if not private.get_setting_bool('rewards.enabled', false) then
      raise exception 'Reward redemption is not enabled right now.' using errcode = 'P0001';
    end if;
    redeem_rate := private.get_setting_numeric('rewards.redeem_points_per_currency_unit', 0);
    if redeem_rate <= 0 then
      raise exception 'Reward redemption is not configured.' using errcode = 'P0001';
    end if;
    perform pg_advisory_xact_lock(hashtext('xshop_rewards:' || customer::text));
    reward_balance := private.reward_balance(customer);
    if redeem_points > reward_balance then
      raise exception 'You do not have that many reward points.' using errcode = 'P0001';
    end if;
    reward_discount := floor((redeem_points::numeric / redeem_rate) * 100) / 100;
    if reward_discount <= 0 then
      raise exception 'Redeem more points to reach a non-zero discount.' using errcode = '22023';
    end if;
    if reward_discount >= remaining then
      raise exception 'Points cannot cover the entire order with crypto checkout. Redeem fewer points.' using errcode = 'P0001';
    end if;
  end if;

  final_total := snapshot_total - coupon_discount - reward_discount;
  if final_total <= 0 then
    raise exception 'Zero-total orders cannot use the configured crypto checkout.' using errcode = 'P0001';
  end if;

  update public.orders
  set subtotal_amount = snapshot_subtotal,
      discount_amount = snapshot_discount_total,
      coupon_id = coupon_key,
      coupon_code_snapshot = coupon_code_clean,
      coupon_discount_amount = coupon_discount,
      reward_points_redeemed = case when reward_discount > 0 then redeem_points else 0 end,
      reward_discount_amount = reward_discount,
      total_amount = final_total
  where id = order_key;

  if coupon_key is not null then
    insert into public.coupon_redemptions (coupon_id, order_id, customer_id, code_snapshot, amount_applied, currency_code, status)
    values (coupon_key, order_key, customer, coupon_code_clean, coupon_discount, order_currency, 'applied');
  end if;

  if reward_discount > 0 then
    insert into public.reward_transactions (customer_id, entry_type, points_delta, description, related_order_id)
    values (customer, 'redeem', -redeem_points, 'Points redeemed at checkout', order_key);
  end if;

  select order_row.order_number into order_number_value from public.orders as order_row where order_row.id = order_key;

  delete from public.cart_items where cart_id = cart_key;
  return jsonb_build_object('order_id', order_key, 'order_number', order_number_value, 'currency_code', order_currency, 'subtotal', snapshot_subtotal, 'discount_total', snapshot_discount_total, 'coupon_discount', coupon_discount, 'reward_discount', reward_discount, 'total', final_total, 'payment_status', 'unpaid', 'fulfillment_status', 'not_eligible');
end;
$$;

-- ---------------------------------------------------------------------------
-- 6. Catalog: expose deal end timestamps and extend search. The visibility
--    gate (active + public + rights-verified + priced) is unchanged.
-- ---------------------------------------------------------------------------

-- Appending one column preserves every dependent function and grant.
create or replace view public.catalog_current_offers
with (security_invoker = true)
as
select
  price.id as price_id,
  price.product_id,
  price.variant_id,
  product.currency_code,
  price.amount as original_price,
  case
    when deal.discount_type = 'percent'
      then round(price.amount * (1 - deal.discount_value / 100), 2)
    when deal.discount_type = 'amount' and deal.currency_code = product.currency_code
      then greatest(0, round(price.amount - deal.discount_value, 2))
    else price.amount
  end as current_price,
  (deal.id is not null) as has_active_deal,
  public.catalog_option_available(price.id) as is_available,
  price.availability_mode,
  price.fulfillment_mode,
  variant.variant_name,
  variant.sku,
  variant.denomination_value,
  variant.sort_order as variant_sort_order,
  price.created_at,
  deal.ends_at as deal_ends_at
from public.product_prices as price
join public.products as product on product.id = price.product_id
left join public.product_variants as variant
  on variant.id = price.variant_id and variant.product_id = price.product_id
left join lateral (
  select candidate.*
  from public.product_deals as candidate
  where candidate.product_id = price.product_id
    and (candidate.variant_id is null or candidate.variant_id = price.variant_id)
    and candidate.status = 'active'
    and (candidate.starts_at is null or candidate.starts_at <= now())
    and (candidate.ends_at is null or candidate.ends_at > now())
    and (candidate.discount_type <> 'amount' or candidate.currency_code = product.currency_code)
  order by (candidate.variant_id is not null) desc, candidate.priority desc, candidate.created_at desc
  limit 1
) as deal on true
where product.status = 'active'
  and product.visibility = 'public'
  and product.resale_rights_verified
  and ((price.variant_id is null and not exists (
         select 1 from public.product_variants as any_variant where any_variant.product_id = product.id
       )) or (variant.id is not null and variant.status = 'active'));

drop function if exists public.search_catalog(text, text, numeric, numeric, text, boolean, boolean, text, text, text, integer, integer);

create or replace function public.search_catalog(
  search_term text default null,
  category_slug text default null,
  min_price numeric default null,
  max_price numeric default null,
  currency_code_filter text default null,
  available_only boolean default false,
  deals_only boolean default false,
  product_type_filter text default null,
  slug_filter text default null,
  provider_filter text default null,
  denomination_min numeric default null,
  denomination_max numeric default null,
  worldwide_only boolean default false,
  featured_only boolean default false,
  sort_by text default 'relevant',
  result_limit integer default 24,
  result_offset integer default 0
)
returns table (
  product_id uuid,
  slug text,
  name text,
  short_description text,
  description text,
  product_type text,
  currency_code text,
  price_options jsonb,
  categories jsonb,
  media jsonb,
  display_price numeric,
  display_original_price numeric,
  on_deal boolean,
  is_available boolean,
  created_at timestamptz,
  total_count bigint
)
language plpgsql
stable
security invoker
set search_path = ''
as $$
begin
  if min_price is not null and min_price < 0 then
    raise exception 'Minimum price cannot be negative.' using errcode = '22023';
  end if;
  if max_price is not null and max_price < 0 then
    raise exception 'Maximum price cannot be negative.' using errcode = '22023';
  end if;
  if min_price is not null and max_price is not null and max_price < min_price then
    raise exception 'Maximum price must be greater than or equal to minimum price.' using errcode = '22023';
  end if;
  if (min_price is not null or max_price is not null) and currency_code_filter is null then
    raise exception 'Choose a currency before filtering by price.' using errcode = '22023';
  end if;
  if currency_code_filter is not null and currency_code_filter !~ '^[A-Z]{3}$' then
    raise exception 'Currency must be a three-letter uppercase code.' using errcode = '22023';
  end if;
  if denomination_min is not null and denomination_min < 0 then
    raise exception 'Minimum denomination cannot be negative.' using errcode = '22023';
  end if;
  if denomination_max is not null and denomination_max < 0 then
    raise exception 'Maximum denomination cannot be negative.' using errcode = '22023';
  end if;
  if denomination_min is not null and denomination_max is not null and denomination_max < denomination_min then
    raise exception 'Maximum denomination must be greater than or equal to minimum denomination.' using errcode = '22023';
  end if;
  if sort_by not in ('relevant', 'newest', 'price_asc', 'price_desc', 'discount_desc', 'available_first') then
    raise exception 'Unsupported catalog sort.' using errcode = '22023';
  end if;
  if result_limit < 1 or result_limit > 60 or result_offset < 0 then
    raise exception 'Catalog page size or offset is invalid.' using errcode = '22023';
  end if;

  return query
  with visible_products as (
    select product.*
    from public.products as product
    where product.status = 'active'
      and product.visibility = 'public'
      and product.resale_rights_verified
      and (slug_filter is null or product.slug = slug_filter)
      and (product_type_filter is null or product.product_type = product_type_filter)
      and (currency_code_filter is null or product.currency_code = currency_code_filter)
      and (provider_filter is null or btrim(provider_filter) = ''
        or product.provider_name ilike '%' || left(btrim(provider_filter), 120) || '%')
      and (not worldwide_only or product.region_restrictions is null or btrim(product.region_restrictions) = '')
      and (not featured_only or product.featured)
      and ((denomination_min is null and denomination_max is null) or exists (
        select 1 from public.catalog_current_offers as offer
        where offer.product_id = product.id
          and offer.denomination_value is not null
          and (denomination_min is null or offer.denomination_value >= denomination_min)
          and (denomination_max is null or offer.denomination_value <= denomination_max)
      ))
      and (category_slug is null or exists (
        select 1
        from public.product_categories as link
        join public.categories as category on category.id = link.category_id
        where link.product_id = product.id
          and category.slug = category_slug
          and category.status = 'active'
          and category.visibility = 'public'
      ))
      and (
        search_term is null or btrim(search_term) = ''
        or product.name ilike '%' || left(btrim(search_term), 120) || '%'
        or coalesce(product.short_description, '') ilike '%' || left(btrim(search_term), 120) || '%'
        or coalesce(product.description, '') ilike '%' || left(btrim(search_term), 120) || '%'
        or coalesce(product.provider_name, '') ilike '%' || left(btrim(search_term), 120) || '%'
        or exists (
          select 1 from public.catalog_current_offers as offer
          where offer.product_id = product.id
            and coalesce(offer.sku, '') ilike '%' || left(btrim(search_term), 120) || '%'
        )
        or exists (
          select 1 from public.product_categories as link
          join public.categories as category on category.id = link.category_id
          where link.product_id = product.id
            and category.status = 'active'
            and category.visibility = 'public'
            and category.name ilike '%' || left(btrim(search_term), 120) || '%'
        )
      )
  ),
  product_rollup as (
    select
      product.id,
      min(offer.current_price) as display_price,
      (array_agg(offer.original_price order by offer.current_price, offer.variant_sort_order nulls first))[1] as display_original_price,
      bool_or(offer.has_active_deal and offer.current_price < offer.original_price) as on_deal,
      bool_or(offer.is_available) as is_available,
      max(case
        when offer.original_price > 0
          then (offer.original_price - offer.current_price) / offer.original_price
        else 0
      end) as max_discount_ratio,
      jsonb_agg(jsonb_build_object(
        'price_id', offer.price_id,
        'variant_id', offer.variant_id,
        'variant_name', offer.variant_name,
        'sku', offer.sku,
        'denomination_value', offer.denomination_value,
        'price', offer.current_price,
        'original_price', offer.original_price,
        'on_deal', offer.has_active_deal and offer.current_price < offer.original_price,
        'deal_ends_at', offer.deal_ends_at,
        'available', offer.is_available,
        'availability_mode', offer.availability_mode,
        'fulfillment_mode', offer.fulfillment_mode
      ) order by offer.variant_sort_order nulls first, offer.current_price) as price_options
    from visible_products as product
    join public.catalog_current_offers as offer on offer.product_id = product.id
    group by product.id
  ),
  filtered_products as (
    select product.*, rollup.display_price, rollup.display_original_price,
      rollup.on_deal, rollup.is_available, rollup.max_discount_ratio, rollup.price_options
    from visible_products as product
    join product_rollup as rollup on rollup.id = product.id
    where (not available_only or rollup.is_available)
      and (not deals_only or rollup.on_deal)
      and (min_price is null or exists (
        select 1 from public.catalog_current_offers as offer
        where offer.product_id = product.id
          and offer.current_price >= min_price
          and (max_price is null or offer.current_price <= max_price)
          and (currency_code_filter is null or offer.currency_code = currency_code_filter)
      ))
      and (max_price is null or exists (
        select 1 from public.catalog_current_offers as offer
        where offer.product_id = product.id
          and offer.current_price <= max_price
          and (min_price is null or offer.current_price >= min_price)
          and (currency_code_filter is null or offer.currency_code = currency_code_filter)
      ))
  )
  select
    product.id,
    product.slug,
    product.name,
    product.short_description,
    product.description,
    product.product_type,
    product.currency_code,
    product.price_options,
    coalesce((
      select jsonb_agg(jsonb_build_object('id', category.id, 'name', category.name, 'slug', category.slug) order by category.sort_order, category.name)
      from public.product_categories as link
      join public.categories as category on category.id = link.category_id
      where link.product_id = product.id
        and category.status = 'active'
        and category.visibility = 'public'
    ), '[]'::jsonb),
    coalesce((
      select jsonb_agg(jsonb_build_object('id', item.id, 'bucket_id', item.bucket_id, 'object_path', item.object_path, 'alt_text', item.alt_text) order by item.sort_order, item.created_at)
      from public.product_media as item
      where item.product_id = product.id
    ), '[]'::jsonb),
    product.display_price,
    product.display_original_price,
    coalesce(product.on_deal, false),
    coalesce(product.is_available, false),
    product.created_at,
    count(*) over ()
  from filtered_products as product
  order by
    case when sort_by = 'price_asc' then product.display_price end asc nulls last,
    case when sort_by = 'price_desc' then product.display_price end desc nulls last,
    case when sort_by = 'discount_desc' then product.max_discount_ratio end desc nulls last,
    case when sort_by = 'available_first' then product.is_available end desc,
    case when sort_by = 'relevant' then product.featured end desc,
    case when sort_by = 'relevant' then product.sort_order end asc,
    case when sort_by = 'newest' then product.created_at end desc,
    case when sort_by = 'relevant' then product.created_at end desc,
    product.name asc
  limit result_limit offset result_offset;
end;
$$;
revoke all on function public.search_catalog(text, text, numeric, numeric, text, boolean, boolean, text, text, text, numeric, numeric, boolean, boolean, text, integer, integer) from public;
grant execute on function public.search_catalog(text, text, numeric, numeric, text, boolean, boolean, text, text, text, numeric, numeric, boolean, boolean, text, integer, integer) to anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Reusable email templates + outbox enrichment + admin outbox visibility.
--    No email is sent by the database; a trusted sender worker (service role)
--    renders these templates. See docs/OPERATIONS.md for the contract.
-- ---------------------------------------------------------------------------

create table if not exists public.email_templates (
  key text primary key check (key ~ '^[a-z0-9_.]{1,80}$'),
  subject text not null check (char_length(subject) between 1 and 300),
  body_html text not null check (char_length(body_html) between 1 and 60000),
  body_text text check (body_text is null or char_length(body_text) <= 60000),
  description text check (description is null or char_length(description) <= 500),
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.email_templates is 'Reusable transactional email templates rendered by a trusted sender worker. Variables: {{store_name}} {{order_number}} {{contact_email}} {{items_html}} {{items_text}} {{order_url}} {{support_email}} {{year}}.';

alter table public.email_templates enable row level security;
revoke all on public.email_templates from public, anon, authenticated;
grant select, insert, update, delete on public.email_templates to authenticated;

drop policy if exists "XSHOP admins manage email templates" on public.email_templates;
create policy "XSHOP admins manage email templates"
on public.email_templates
for all
to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])))
with check ((select private.user_has_any_role(array['admin', 'super_admin'])));

drop trigger if exists email_templates_set_updated_at on public.email_templates;
create trigger email_templates_set_updated_at before update on public.email_templates
for each row execute function private.set_updated_at();

drop trigger if exists email_templates_audit on public.email_templates;
create trigger email_templates_audit after insert or update or delete on public.email_templates
for each row execute function private.audit_row_change();

insert into public.email_templates (key, subject, body_html, body_text, description) values
  ('order_fulfilled',
   'Your XSHOP order {{order_number}} is ready',
   '<!DOCTYPE html><html><body style="margin:0;padding:0;background-color:#0a0a0b;font-family:Arial,Helvetica,sans-serif;">'
   || '<div style="max-width:600px;margin:0 auto;padding:32px 20px;">'
   || '<div style="text-align:center;padding:24px 0;"><span style="font-size:22px;font-weight:bold;letter-spacing:4px;color:#ffffff;">XSHOP</span></div>'
   || '<div style="background-color:#141417;border:1px solid #2a2a30;border-radius:16px;padding:32px;">'
   || '<h1 style="margin:0 0 8px;font-size:22px;color:#ffffff;">Your digital order is ready</h1>'
   || '<p style="margin:0 0 24px;font-size:14px;color:#a1a1aa;">Order <strong style="color:#d8b4fe;">{{order_number}}</strong> for {{contact_email}}</p>'
   || '<div style="margin:0 0 24px;">{{items_html}}</div>'
   || '<a href="{{order_url}}" style="display:inline-block;background-color:#7c3aed;color:#ffffff;text-decoration:none;font-size:14px;font-weight:bold;padding:12px 24px;border-radius:10px;">View your delivery</a>'
   || '<p style="margin:24px 0 0;font-size:12px;line-height:1.6;color:#71717a;">Your delivery is also available any time in your XSHOP account under Orders. Keep your digital goods private — never share them publicly. Questions? Contact {{support_email}}.</p>'
   || '</div>'
   || '<p style="text-align:center;font-size:12px;color:#52525b;margin:24px 0 0;">© {{year}} XSHOP · Legitimate digital goods, carefully delivered.</p>'
   || '</div></body></html>',
   'XSHOP — Your digital order is ready.' || chr(10) || chr(10)
   || 'Order {{order_number}} for {{contact_email}}.' || chr(10) || chr(10)
   || '{{items_text}}' || chr(10) || chr(10)
   || 'View your delivery: {{order_url}}' || chr(10) || chr(10)
   || 'Your delivery is also available any time in your XSHOP account under Orders. Questions? Contact {{support_email}}.',
   'Sent after an order is fulfilled. Rendered by the sender worker; never from the browser.')
on conflict (key) do nothing;

-- Enrich every outbox row with the order number, item snapshots, and account
-- URL path so the sender worker needs no extra queries. Delivery payloads
-- (codes/keys) are never copied into the outbox.
create or replace function private.enrich_fulfillment_outbox()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_no text;
  items jsonb;
  enriched jsonb;
begin
  select order_row.order_number into order_no from public.orders as order_row where order_row.id = new.order_id;
  select coalesce(jsonb_agg(jsonb_build_object(
    'name', order_item.product_name_snapshot,
    'variant', order_item.variant_name_snapshot,
    'quantity', order_item.quantity,
    'line_total', order_item.line_total_amount,
    'currency', order_item.currency_code
  ) order by order_item.created_at), '[]'::jsonb)
  into items from public.order_items as order_item where order_item.order_id = new.order_id;

  enriched := coalesce(new.payload, '{}'::jsonb) || jsonb_build_object(
    'order_number', order_no,
    'items', items,
    'order_url_path', '/account/orders/' || new.order_id::text
  );
  if pg_column_size(enriched) > 8192 then
    -- Extremely large orders keep the reference fields; the worker can read
    -- item details through its privileged connection instead.
    enriched := coalesce(new.payload, '{}'::jsonb) || jsonb_build_object(
      'order_number', order_no,
      'items_truncated', true,
      'order_url_path', '/account/orders/' || new.order_id::text
    );
  end if;
  new.payload := enriched;
  return new;
end;
$$;
revoke all on function private.enrich_fulfillment_outbox() from public, anon, authenticated;

drop trigger if exists fulfillment_outbox_enrich on public.fulfillment_email_outbox;
create trigger fulfillment_outbox_enrich before insert on public.fulfillment_email_outbox
for each row execute function private.enrich_fulfillment_outbox();

-- Admin visibility into the outbox (metadata + template payload, which holds
-- order references and item names only — never delivery secrets).
create or replace function public.admin_list_email_outbox(_limit integer default 50)
returns table (
  id uuid,
  order_id uuid,
  order_number text,
  event_type text,
  recipient_email text,
  status text,
  attempts integer,
  created_at timestamptz,
  sent_at timestamptz,
  payload jsonb
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare window_limit integer := greatest(1, least(coalesce(_limit, 50), 200));
begin
  if (select auth.uid()) is null or not (select private.user_has_any_role(array['admin', 'super_admin'])) then
    raise exception 'Not authorized to view the email outbox.' using errcode = '42501';
  end if;

  return query
  select
    outbox.id,
    outbox.order_id,
    order_row.order_number,
    outbox.event_type,
    outbox.recipient_email,
    outbox.status,
    outbox.attempts,
    outbox.created_at,
    outbox.sent_at,
    outbox.payload
  from public.fulfillment_email_outbox as outbox
  join public.orders as order_row on order_row.id = outbox.order_id
  order by outbox.created_at desc
  limit window_limit;
end;
$$;
revoke all on function public.admin_list_email_outbox(integer) from public, anon;
grant execute on function public.admin_list_email_outbox(integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 8. Configurable legal + support settings. Empty values mean "not
--    configured" — the storefront renders neutral fallback copy instead.
-- ---------------------------------------------------------------------------

insert into public.store_settings (key, value, description, is_public) values
  ('legal.terms', '""'::jsonb, 'Store Terms text shown on the Terms page. Markdown supported. Empty = unconfigured.', true),
  ('legal.privacy', '""'::jsonb, 'Privacy policy text shown on the Privacy page. Markdown supported. Empty = unconfigured.', true),
  ('legal.refund', '""'::jsonb, 'Refund policy text shown on the Refunds page. Markdown supported. Empty = unconfigured.', true),
  ('store.support_email', '""'::jsonb, 'Public support email address shown on support and legal pages.', true),
  ('store.support_url', '""'::jsonb, 'Public support URL (help center or contact form). Empty = use the in-app support page.', true)
on conflict (key) do nothing;

commit;
