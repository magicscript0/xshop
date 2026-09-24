-- XSHOP Phase 8: coupons, referrals, an immutable rewards ledger, lifecycle
-- notifications, and admin analytics.
--
-- Additive only. Coupons are validated server-side; the browser never
-- calculates a discount that the database trusts. No coupon codes, referral
-- rewards, points, or analytics values are fabricated or seeded.

begin;

-- ---------------------------------------------------------------------------
-- 1. Coupons and auditable redemptions.
-- ---------------------------------------------------------------------------

create table if not exists public.coupons (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9][A-Z0-9_-]{2,39}$'),
  description text check (description is null or char_length(description) <= 300),
  discount_type text not null check (discount_type in ('percent', 'amount')),
  discount_value numeric(14, 4) not null check (discount_value > 0),
  currency_code text check (currency_code is null or currency_code ~ '^[A-Z]{3}$'),
  min_order_amount numeric(14, 2) check (min_order_amount is null or min_order_amount >= 0),
  max_discount_amount numeric(14, 2) check (max_discount_amount is null or max_discount_amount > 0),
  usage_limit integer check (usage_limit is null or usage_limit > 0),
  per_customer_limit integer not null default 1 check (per_customer_limit between 1 and 100),
  status text not null default 'inactive' check (status in ('active', 'inactive')),
  starts_at timestamptz,
  ends_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ends_at is null or starts_at is null or ends_at > starts_at),
  check ((discount_type = 'percent' and discount_value <= 100 and currency_code is null)
      or (discount_type = 'amount' and currency_code is not null))
);

create table if not exists public.coupon_redemptions (
  id uuid primary key default gen_random_uuid(),
  coupon_id uuid not null references public.coupons(id) on delete restrict,
  order_id uuid not null unique references public.orders(id) on delete restrict,
  customer_id uuid not null references auth.users(id) on delete restrict,
  code_snapshot text not null,
  amount_applied numeric(14, 2) not null check (amount_applied > 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  status text not null default 'applied' check (status in ('applied', 'confirmed', 'released')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists coupon_redemptions_coupon_idx on public.coupon_redemptions (coupon_id, status);
create index if not exists coupon_redemptions_customer_idx on public.coupon_redemptions (customer_id, coupon_id, status);

alter table public.coupons enable row level security;
alter table public.coupon_redemptions enable row level security;
revoke all on public.coupons, public.coupon_redemptions from public, anon, authenticated;
grant select, insert, update, delete on public.coupons to authenticated;
grant select on public.coupon_redemptions to authenticated;

-- Coupon codes are not publicly enumerable; validation happens through RPCs.
drop policy if exists "XSHOP admins manage coupons" on public.coupons;
create policy "XSHOP admins manage coupons"
on public.coupons
for all
to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])))
with check ((select private.user_has_any_role(array['admin', 'super_admin'])));

drop policy if exists "XSHOP customers read own coupon redemptions" on public.coupon_redemptions;
create policy "XSHOP customers read own coupon redemptions"
on public.coupon_redemptions
for select
to authenticated
using (customer_id = (select auth.uid()));

drop policy if exists "XSHOP admins read coupon redemptions" on public.coupon_redemptions;
create policy "XSHOP admins read coupon redemptions"
on public.coupon_redemptions
for select
to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])));

drop trigger if exists coupons_set_updated_at on public.coupons;
create trigger coupons_set_updated_at before update on public.coupons
for each row execute function private.set_updated_at();

drop trigger if exists coupon_redemptions_set_updated_at on public.coupon_redemptions;
create trigger coupon_redemptions_set_updated_at before update on public.coupon_redemptions
for each row execute function private.set_updated_at();

drop trigger if exists coupons_audit on public.coupons;
create trigger coupons_audit after insert or update or delete on public.coupons
for each row execute function private.audit_row_change();

-- ---------------------------------------------------------------------------
-- 2. Rewards: an immutable, explainable points ledger. Balances are always a
--    sum over ledger rows; there is no mutable balance column anywhere.
-- ---------------------------------------------------------------------------

create table if not exists public.reward_transactions (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  entry_type text not null check (entry_type in ('earn', 'redeem', 'refund', 'adjust', 'referral_bonus', 'expire')),
  points_delta integer not null check (points_delta <> 0 and points_delta between -10000000 and 10000000),
  description text not null check (char_length(description) between 1 and 300),
  related_order_id uuid references public.orders(id) on delete set null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists reward_transactions_customer_idx on public.reward_transactions (customer_id, created_at desc);
-- One earn / redeem / refund / referral_bonus entry per order, enforced by the database.
create unique index if not exists reward_transactions_order_entry_once
  on public.reward_transactions (related_order_id, entry_type)
  where related_order_id is not null;

alter table public.reward_transactions enable row level security;
revoke all on table public.reward_transactions from public, anon, authenticated;
grant select on public.reward_transactions to authenticated;

drop policy if exists "XSHOP customers read own reward ledger" on public.reward_transactions;
create policy "XSHOP customers read own reward ledger"
on public.reward_transactions
for select
to authenticated
using (customer_id = (select auth.uid()));

drop policy if exists "XSHOP admins read reward ledger" on public.reward_transactions;
create policy "XSHOP admins read reward ledger"
on public.reward_transactions
for select
to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])));

create or replace function private.reward_balance(_customer uuid)
returns bigint
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(sum(entry.points_delta), 0)
  from public.reward_transactions as entry
  where entry.customer_id = _customer;
$$;
revoke all on function private.reward_balance(uuid) from public, anon, authenticated;

create or replace function public.get_my_rewards()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  customer uuid := (select auth.uid());
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  return jsonb_build_object(
    'enabled', private.get_setting_bool('rewards.enabled', false),
    'balance', private.reward_balance(customer),
    'earn_rate', private.get_setting_numeric('rewards.earn_points_per_currency_unit', 0),
    'redeem_rate', private.get_setting_numeric('rewards.redeem_points_per_currency_unit', 0),
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', entry.id,
        'entry_type', entry.entry_type,
        'points_delta', entry.points_delta,
        'description', entry.description,
        'related_order_id', entry.related_order_id,
        'created_at', entry.created_at
      ) order by entry.created_at desc)
      from (
        select * from public.reward_transactions as ledger
        where ledger.customer_id = customer
        order by ledger.created_at desc
        limit 50
      ) as entry
    ), '[]'::jsonb)
  );
end;
$$;
revoke all on function public.get_my_rewards() from public, anon;
grant execute on function public.get_my_rewards() to authenticated;

create or replace function public.admin_adjust_reward_points(_customer_id uuid, _points_delta integer, _reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  resulting bigint;
begin
  if actor is null or not (select private.user_has_any_role(array['admin', 'super_admin'])) then
    raise exception 'Not authorized to adjust rewards.' using errcode = '42501';
  end if;
  if _points_delta is null or _points_delta = 0 or abs(_points_delta) > 1000000 then
    raise exception 'Provide a non-zero adjustment within sensible bounds.' using errcode = '22023';
  end if;
  if char_length(btrim(coalesce(_reason, ''))) = 0 then
    raise exception 'An adjustment reason is required.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles where id = _customer_id) then
    raise exception 'Customer not found.' using errcode = 'P0002';
  end if;

  perform pg_advisory_xact_lock(hashtext('xshop_rewards:' || _customer_id::text));
  resulting := private.reward_balance(_customer_id) + _points_delta;
  if resulting < 0 then
    raise exception 'The adjustment would make the balance negative.' using errcode = '22023';
  end if;

  insert into public.reward_transactions (customer_id, entry_type, points_delta, description, created_by)
  values (_customer_id, 'adjust', _points_delta, left(btrim(_reason), 300), actor);

  insert into public.admin_audit_log (actor_id, action, entity_type, entity_id, metadata)
  values (actor, 'reward_adjust', 'reward_transactions', _customer_id::text,
    jsonb_build_object('points_delta', _points_delta, 'reason', left(btrim(_reason), 300)));
end;
$$;
revoke all on function public.admin_adjust_reward_points(uuid, integer, text) from public, anon;
grant execute on function public.admin_adjust_reward_points(uuid, integer, text) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Referrals: codes, attribution, and qualification on verified payment.
--    Clicking a link never rewards anyone; qualification requires a verified
--    order by a genuinely new customer, and self-referral is impossible.
-- ---------------------------------------------------------------------------

create table if not exists public.referral_codes (
  customer_id uuid primary key references auth.users(id) on delete cascade,
  code text not null unique check (code ~ '^[A-Z0-9]{6,12}$'),
  created_at timestamptz not null default now()
);

create table if not exists public.referral_attributions (
  id uuid primary key default gen_random_uuid(),
  referred_customer_id uuid not null unique references auth.users(id) on delete cascade,
  referrer_customer_id uuid not null references auth.users(id) on delete cascade,
  code_snapshot text not null,
  status text not null default 'pending' check (status in ('pending', 'qualified', 'void')),
  reward_points integer check (reward_points is null or reward_points >= 0),
  qualified_order_id uuid references public.orders(id) on delete set null,
  created_at timestamptz not null default now(),
  qualified_at timestamptz,
  check (referred_customer_id <> referrer_customer_id)
);
create index if not exists referral_attributions_referrer_idx on public.referral_attributions (referrer_customer_id, status);

alter table public.referral_codes enable row level security;
alter table public.referral_attributions enable row level security;
revoke all on public.referral_codes, public.referral_attributions from public, anon, authenticated;
grant select on public.referral_codes, public.referral_attributions to authenticated;

drop policy if exists "XSHOP customers read own referral code" on public.referral_codes;
create policy "XSHOP customers read own referral code"
on public.referral_codes
for select
to authenticated
using (customer_id = (select auth.uid()));

drop policy if exists "XSHOP admins read referral codes" on public.referral_codes;
create policy "XSHOP admins read referral codes"
on public.referral_codes
for select
to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])));

drop policy if exists "XSHOP participants read own referral attributions" on public.referral_attributions;
create policy "XSHOP participants read own referral attributions"
on public.referral_attributions
for select
to authenticated
using (referred_customer_id = (select auth.uid()) or referrer_customer_id = (select auth.uid()));

drop policy if exists "XSHOP admins read referral attributions" on public.referral_attributions;
create policy "XSHOP admins read referral attributions"
on public.referral_attributions
for select
to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])));

create or replace function public.get_my_referral_code()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer uuid := (select auth.uid());
  existing public.referral_codes%rowtype;
  candidate text;
  attempt integer := 0;
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  perform private.consume_rate_limit('referral_code', 20, 3600);

  select * into existing from public.referral_codes where customer_id = customer;
  if not found then
    loop
      attempt := attempt + 1;
      candidate := upper(substr(md5(gen_random_uuid()::text), 1, 10));
      begin
        insert into public.referral_codes (customer_id, code) values (customer, candidate);
        exit;
      exception when unique_violation then
        if exists (select 1 from public.referral_codes where customer_id = customer) then exit; end if;
        if attempt >= 5 then raise exception 'A referral code could not be generated. Try again.' using errcode = 'P0001'; end if;
      end;
    end loop;
    select * into existing from public.referral_codes where customer_id = customer;
  end if;

  return jsonb_build_object(
    'code', existing.code,
    'enabled', private.get_setting_bool('referrals.enabled', false),
    'reward_points', private.get_setting_numeric('referrals.reward_points', 0),
    'pending', (select count(*) from public.referral_attributions as attribution
      where attribution.referrer_customer_id = customer and attribution.status = 'pending'),
    'qualified', (select count(*) from public.referral_attributions as attribution
      where attribution.referrer_customer_id = customer and attribution.status = 'qualified')
  );
end;
$$;
revoke all on function public.get_my_referral_code() from public, anon;
grant execute on function public.get_my_referral_code() to authenticated;

create or replace function public.apply_referral_code(_code text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer uuid := (select auth.uid());
  normalized text := upper(btrim(coalesce(_code, '')));
  owner_record public.referral_codes%rowtype;
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  perform private.consume_rate_limit('referral_apply', 10, 3600);
  if not private.get_setting_bool('referrals.enabled', false) then
    raise exception 'Referrals are not enabled right now.' using errcode = 'P0001';
  end if;
  if normalized !~ '^[A-Z0-9]{6,12}$' then
    raise exception 'Enter a valid referral code.' using errcode = '22023';
  end if;
  if exists (select 1 from public.referral_attributions where referred_customer_id = customer) then
    raise exception 'A referral code has already been applied to your account.' using errcode = 'P0001';
  end if;
  if exists (select 1 from public.orders where customer_id = customer and payment_status = 'verified') then
    raise exception 'Referral codes can only be applied by new customers before their first verified order.' using errcode = 'P0001';
  end if;

  select * into owner_record from public.referral_codes where code = normalized;
  if not found or owner_record.customer_id = customer then
    raise exception 'Enter a valid referral code.' using errcode = '22023';
  end if;

  insert into public.referral_attributions (referred_customer_id, referrer_customer_id, code_snapshot)
  values (customer, owner_record.customer_id, normalized);

  return jsonb_build_object('status', 'pending', 'code', normalized);
end;
$$;
revoke all on function public.apply_referral_code(text) from public, anon;
grant execute on function public.apply_referral_code(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Order columns for coupon and reward snapshots, plus the widened
--    total-consistency check. Existing rows keep their exact totals.
-- ---------------------------------------------------------------------------

alter table public.orders
  add column if not exists coupon_id uuid references public.coupons(id) on delete set null,
  add column if not exists coupon_code_snapshot text,
  add column if not exists coupon_discount_amount numeric(14, 2) not null default 0 check (coupon_discount_amount >= 0),
  add column if not exists reward_points_redeemed integer not null default 0 check (reward_points_redeemed >= 0),
  add column if not exists reward_discount_amount numeric(14, 2) not null default 0 check (reward_discount_amount >= 0);

do $$
declare violated record;
begin
  for violated in
    select conname from pg_constraint
    where conrelid = 'public.orders'::regclass and contype = 'c'
      and pg_get_constraintdef(oid) like '%subtotal_amount - discount_amount%'
  loop
    execute format('alter table public.orders drop constraint %I', violated.conname);
  end loop;
end $$;

alter table public.orders add constraint orders_total_consistency_check
  check (total_amount = subtotal_amount - discount_amount - coupon_discount_amount - reward_discount_amount
    and total_amount >= 0);

-- ---------------------------------------------------------------------------
-- 5. Server-side coupon evaluation and checkout preview.
-- ---------------------------------------------------------------------------

create or replace function private.evaluate_coupon(
  _customer uuid,
  _code text,
  _currency text,
  _eligible_amount numeric,
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
  if coupon_record.min_order_amount is not null and _eligible_amount < coupon_record.min_order_amount then
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
    discount := round(_eligible_amount * coupon_record.discount_value / 100, 2);
  else
    discount := least(coupon_record.discount_value, _eligible_amount);
  end if;
  if coupon_record.max_discount_amount is not null then
    discount := least(discount, coupon_record.max_discount_amount);
  end if;
  discount := least(round(discount, 2), _eligible_amount);
  if discount <= 0 then
    raise exception 'This coupon does not apply to this order.' using errcode = 'P0001';
  end if;

  coupon_id := coupon_record.id;
end;
$$;
revoke all on function private.evaluate_coupon(uuid, text, text, numeric) from public, anon, authenticated;

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
  evaluated record;
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  perform private.consume_rate_limit('coupon_preview', 30, 600);

  select sum(offer.current_price * item.quantity), min(product.currency_code), count(distinct product.currency_code)
  into cart_total, cart_currency, currency_count
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

  select * into evaluated from private.evaluate_coupon(customer, _code, cart_currency, cart_total);
  return jsonb_build_object(
    'code', upper(btrim(_code)),
    'discount', evaluated.discount,
    'currency_code', cart_currency,
    'estimated_total', greatest(0, cart_total - evaluated.discount)
  );
end;
$$;
revoke all on function public.preview_coupon(text) from public, anon;
grant execute on function public.preview_coupon(text) to authenticated;

-- ---------------------------------------------------------------------------
-- 6. Checkout: replace create_order_from_cart with an extended version that
--    applies server-validated coupons and reward redemption. The previous
--    two-argument signature is dropped so RPC name resolution stays exact.
-- ---------------------------------------------------------------------------

drop function if exists public.create_order_from_cart(text, uuid);

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
  redeem_points integer := coalesce(_redeem_points, 0);
  reward_discount numeric(14,2) := 0;
  redeem_rate numeric;
  reward_balance bigint;
  remaining numeric(14,2);
  final_total numeric(14,2);
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
    return jsonb_build_object('order_id', existing_order.id, 'currency_code', existing_order.currency_code, 'subtotal', existing_order.subtotal_amount, 'discount_total', existing_order.discount_amount, 'coupon_discount', existing_order.coupon_discount_amount, 'reward_discount', existing_order.reward_discount_amount, 'total', existing_order.total_amount, 'payment_status', existing_order.payment_status, 'fulfillment_status', existing_order.fulfillment_status);
  end if;

  select cart.id into cart_key from public.carts as cart where cart.customer_id = customer for update;
  -- Recheck after locking the cart so concurrent retries with the same key return
  -- the order created by the transaction that acquired the lock first.
  select * into existing_order from public.orders
  where customer_id = customer and idempotency_key = _idempotency_key;
  if found then
    return jsonb_build_object('order_id', existing_order.id, 'currency_code', existing_order.currency_code, 'subtotal', existing_order.subtotal_amount, 'discount_total', existing_order.discount_amount, 'coupon_discount', existing_order.coupon_discount_amount, 'reward_discount', existing_order.reward_discount_amount, 'total', existing_order.total_amount, 'payment_status', existing_order.payment_status, 'fulfillment_status', existing_order.fulfillment_status);
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

  -- Server-side coupon validation. Browser-calculated discounts are never trusted.
  if coupon_code_clean is not null then
    select * into evaluated from private.evaluate_coupon(customer, coupon_code_clean, order_currency, snapshot_total);
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

  delete from public.cart_items where cart_id = cart_key;
  return jsonb_build_object('order_id', order_key, 'currency_code', order_currency, 'subtotal', snapshot_subtotal, 'discount_total', snapshot_discount_total, 'coupon_discount', coupon_discount, 'reward_discount', reward_discount, 'total', final_total, 'payment_status', 'unpaid', 'fulfillment_status', 'not_eligible');
end;
$$;
revoke all on function public.create_order_from_cart(text, uuid, text, integer) from public, anon;
grant execute on function public.create_order_from_cart(text, uuid, text, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- 7. Lifecycle side effects: customer notifications for order/payment events,
--    reward earning, referral qualification, coupon confirm/release, and
--    reward refunds when a payment fails. All idempotent via unique indexes.
-- ---------------------------------------------------------------------------

create or replace function private.on_order_created_notify()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.customer_notifications (customer_id, notification_type, title, message, related_order_id)
  values (new.customer_id, 'order', 'Order created',
    'Your order was created. Choose a payment method to continue.', new.id);
  return new;
end;
$$;
revoke all on function private.on_order_created_notify() from public, anon, authenticated;

drop trigger if exists orders_created_notify on public.orders;
create trigger orders_created_notify after insert on public.orders
for each row execute function private.on_order_created_notify();

create or replace function private.on_order_payment_status_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  earn_rate numeric;
  earn_points integer;
  attribution public.referral_attributions%rowtype;
  bonus integer;
  min_total numeric;
  redeem_entry public.reward_transactions%rowtype;
begin
  if new.payment_status is not distinct from old.payment_status then return new; end if;

  if new.payment_status = 'submitted' then
    insert into public.customer_notifications (customer_id, notification_type, title, message, related_order_id)
    values (new.customer_id, 'payment', 'Payment under review',
      'Your transaction reference was submitted and is awaiting manual review.', new.id);

  elsif new.payment_status = 'verified' then
    insert into public.customer_notifications (customer_id, notification_type, title, message, related_order_id)
    values (new.customer_id, 'payment', 'Payment verified',
      'Your payment was verified. Fulfillment is underway.', new.id);

    update public.coupon_redemptions set status = 'confirmed'
    where order_id = new.id and status = 'applied';

    if private.get_setting_bool('rewards.enabled', false) then
      earn_rate := private.get_setting_numeric('rewards.earn_points_per_currency_unit', 0);
      earn_points := floor(new.total_amount * earn_rate);
      if earn_points >= 1 then
        insert into public.reward_transactions (customer_id, entry_type, points_delta, description, related_order_id)
        values (new.customer_id, 'earn', least(earn_points, 10000000), 'Points earned for a verified order', new.id)
        on conflict (related_order_id, entry_type) where related_order_id is not null do nothing;
      end if;
    end if;

    if private.get_setting_bool('referrals.enabled', false) then
      select * into attribution from public.referral_attributions
      where referred_customer_id = new.customer_id and status = 'pending'
      for update;
      if found then
        min_total := private.get_setting_numeric('referrals.min_qualifying_order_total', 0);
        if new.total_amount >= min_total then
          bonus := greatest(0, floor(private.get_setting_numeric('referrals.reward_points', 0)))::integer;
          update public.referral_attributions
          set status = 'qualified', qualified_at = now(), qualified_order_id = new.id, reward_points = bonus
          where id = attribution.id;
          if bonus >= 1 then
            insert into public.reward_transactions (customer_id, entry_type, points_delta, description, related_order_id)
            values (attribution.referrer_customer_id, 'referral_bonus', bonus, 'Referral qualified after a verified order', new.id)
            on conflict (related_order_id, entry_type) where related_order_id is not null do nothing;
            insert into public.customer_notifications (customer_id, notification_type, title, message)
            values (attribution.referrer_customer_id, 'account', 'Referral reward earned',
              'A customer you referred completed a verified order. Reward points were added to your ledger.');
          end if;
        end if;
      end if;
    end if;

  elsif new.payment_status in ('rejected', 'expired') then
    insert into public.customer_notifications (customer_id, notification_type, title, message, related_order_id)
    values (new.customer_id, 'payment',
      case when new.payment_status = 'rejected' then 'Payment rejected' else 'Payment session expired' end,
      case when new.payment_status = 'rejected'
        then 'Your submitted payment could not be verified. Review the order to try again or contact support.'
        else 'Your payment session expired before a transaction was verified. You can start a new payment from the order page.'
      end, new.id);

    update public.coupon_redemptions set status = 'released'
    where order_id = new.id and status = 'applied';

    select * into redeem_entry from public.reward_transactions
    where related_order_id = new.id and entry_type = 'redeem';
    if found then
      insert into public.reward_transactions (customer_id, entry_type, points_delta, description, related_order_id)
      values (redeem_entry.customer_id, 'refund', -redeem_entry.points_delta, 'Points returned after an unsuccessful payment', new.id)
      on conflict (related_order_id, entry_type) where related_order_id is not null do nothing;
    end if;
  end if;

  return new;
end;
$$;
revoke all on function private.on_order_payment_status_change() from public, anon, authenticated;

drop trigger if exists orders_payment_status_side_effects on public.orders;
create trigger orders_payment_status_side_effects after update of payment_status on public.orders
for each row execute function private.on_order_payment_status_change();

-- ---------------------------------------------------------------------------
-- 8. Admin metrics and analytics. Counts and sums over real rows only; when
--    the store is empty every metric is simply zero.
-- ---------------------------------------------------------------------------

create or replace function public.admin_dashboard_metrics()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null or not (select private.user_has_any_role(array['admin', 'super_admin'])) then
    raise exception 'Not authorized to view store metrics.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'orders', (select jsonb_build_object(
      'total', count(*),
      'unpaid', count(*) filter (where payment_status = 'unpaid'),
      'pending', count(*) filter (where payment_status = 'pending'),
      'submitted', count(*) filter (where payment_status = 'submitted'),
      'verified', count(*) filter (where payment_status = 'verified'),
      'rejected', count(*) filter (where payment_status = 'rejected'),
      'expired', count(*) filter (where payment_status = 'expired'),
      'fulfilled', count(*) filter (where fulfillment_status = 'fulfilled'),
      'manual_required', count(*) filter (where fulfillment_status = 'manual_required'),
      'failed', count(*) filter (where fulfillment_status = 'failed')
    ) from public.orders),
    'revenue', coalesce((
      select jsonb_object_agg(currency_code, total)
      from (
        select currency_code, sum(total_amount) as total
        from public.orders where payment_status = 'verified'
        group by currency_code
      ) as revenue_rows
    ), '{}'::jsonb),
    'customers', (select count(*) from public.profiles),
    'products', (select jsonb_build_object(
      'total', count(*),
      'active_public', count(*) filter (where status = 'active' and visibility = 'public' and resale_rights_verified),
      'draft', count(*) filter (where status = 'draft'),
      'archived', count(*) filter (where status = 'archived')
    ) from public.products),
    'inventory', (select jsonb_build_object(
      'available', count(*) filter (where status = 'available'),
      'reserved', count(*) filter (where status = 'reserved'),
      'assigned', count(*) filter (where status = 'assigned'),
      'void', count(*) filter (where status = 'void')
    ) from public.digital_inventory),
    'coupons', jsonb_build_object(
      'active', (select count(*) from public.coupons where status = 'active'),
      'redemptions', (select count(*) from public.coupon_redemptions where status in ('applied', 'confirmed'))
    ),
    'referrals', (select jsonb_build_object(
      'pending', count(*) filter (where status = 'pending'),
      'qualified', count(*) filter (where status = 'qualified')
    ) from public.referral_attributions),
    'rewards', (select jsonb_build_object(
      'points_issued', coalesce(sum(points_delta) filter (where points_delta > 0), 0),
      'points_spent', coalesce(abs(sum(points_delta) filter (where points_delta < 0)), 0)
    ) from public.reward_transactions),
    'payment_review_queue', (select count(*) from public.payment_sessions where status = 'submitted')
  );
end;
$$;
revoke all on function public.admin_dashboard_metrics() from public, anon;
grant execute on function public.admin_dashboard_metrics() to authenticated;

create or replace function public.admin_sales_analytics(_days integer default 30)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  window_days integer := coalesce(_days, 30);
  since timestamptz;
begin
  if (select auth.uid()) is null or not (select private.user_has_any_role(array['admin', 'super_admin'])) then
    raise exception 'Not authorized to view analytics.' using errcode = '42501';
  end if;
  if window_days < 1 or window_days > 365 then
    raise exception 'Choose an analytics window between 1 and 365 days.' using errcode = '22023';
  end if;
  since := date_trunc('day', now()) - make_interval(days => window_days - 1);

  return jsonb_build_object(
    'window_days', window_days,
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'day', to_char(day, 'YYYY-MM-DD'),
        'orders_created', orders_created,
        'orders_verified', orders_verified,
        'verified_total', verified_total
      ) order by day)
      from (
        select date_trunc('day', created_at) as day,
          count(*) as orders_created,
          count(*) filter (where payment_status = 'verified') as orders_verified,
          coalesce(sum(total_amount) filter (where payment_status = 'verified'), 0) as verified_total
        from public.orders
        where created_at >= since
        group by 1
      ) as day_rows
    ), '[]'::jsonb),
    'top_products', coalesce((
      select jsonb_agg(jsonb_build_object(
        'product_name', product_name_snapshot,
        'quantity', quantity_sum,
        'revenue', revenue,
        'currency_code', currency_code
      ) order by revenue desc)
      from (
        select item.product_name_snapshot, item.currency_code,
          sum(item.quantity) as quantity_sum, sum(item.line_total_amount) as revenue
        from public.order_items as item
        join public.orders as order_row on order_row.id = item.order_id
        where order_row.payment_status = 'verified' and order_row.created_at >= since
        group by item.product_name_snapshot, item.currency_code
        order by revenue desc
        limit 10
      ) as product_rows
    ), '[]'::jsonb),
    'coupon_usage', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', code_snapshot,
        'redemptions', redemption_count,
        'amount_applied', amount_total
      ) order by redemption_count desc)
      from (
        select code_snapshot, count(*) as redemption_count, sum(amount_applied) as amount_total
        from public.coupon_redemptions
        where created_at >= since and status in ('applied', 'confirmed')
        group by code_snapshot
        order by redemption_count desc
        limit 10
      ) as coupon_rows
    ), '[]'::jsonb),
    'average_order_value', coalesce((
      select jsonb_object_agg(currency_code, aov)
      from (
        select currency_code, round(avg(total_amount), 2) as aov
        from public.orders
        where payment_status = 'verified' and created_at >= since
        group by currency_code
      ) as aov_rows
    ), '{}'::jsonb)
  );
end;
$$;
revoke all on function public.admin_sales_analytics(integer) from public, anon;
grant execute on function public.admin_sales_analytics(integer) to authenticated;

commit;
