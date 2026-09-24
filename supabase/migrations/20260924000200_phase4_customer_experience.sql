-- XSHOP Phase 4: customer-owned cart, immutable order snapshots, wishlist, and notifications.
-- All order pricing is derived from the current database catalog, never from browser totals.

begin;

create table public.carts (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null unique references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.cart_items (
  id uuid primary key default gen_random_uuid(),
  cart_id uuid not null references public.carts(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid,
  quantity integer not null check (quantity between 1 and 20),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (variant_id, product_id) references public.product_variants(id, product_id) on delete restrict
);
create unique index cart_items_one_option_per_cart
  on public.cart_items (cart_id, product_id, (coalesce(variant_id, '00000000-0000-0000-0000-000000000000'::uuid)));
create index cart_items_cart_idx on public.cart_items (cart_id, created_at);

create table public.orders (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete restrict,
  idempotency_key uuid not null,
  contact_email text not null check (char_length(contact_email) <= 320 and contact_email ~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  subtotal_amount numeric(14, 2) not null check (subtotal_amount >= 0),
  discount_amount numeric(14, 2) not null default 0 check (discount_amount >= 0),
  total_amount numeric(14, 2) not null check (total_amount >= 0),
  payment_status text not null default 'unpaid' check (payment_status = 'unpaid'),
  fulfillment_status text not null default 'not_eligible' check (fulfillment_status in ('not_eligible', 'eligible', 'processing', 'fulfilled', 'manual_required', 'failed', 'cancelled')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (customer_id, idempotency_key),
  check (subtotal_amount - discount_amount = total_amount)
);
create index orders_customer_created_idx on public.orders (customer_id, created_at desc);
create index orders_payment_status_idx on public.orders (payment_status, created_at desc);

create table public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  product_id uuid not null references public.products(id) on delete restrict,
  product_price_id uuid not null references public.product_prices(id) on delete restrict,
  variant_id uuid,
  product_name_snapshot text not null check (char_length(product_name_snapshot) between 1 and 180),
  variant_name_snapshot text,
  sku_snapshot text,
  denomination_value_snapshot numeric(18, 6),
  quantity integer not null check (quantity between 1 and 20),
  unit_price_amount numeric(14, 2) not null check (unit_price_amount > 0),
  unit_discount_amount numeric(14, 2) not null default 0 check (unit_discount_amount >= 0 and unit_discount_amount <= unit_price_amount),
  line_total_amount numeric(14, 2) not null check (line_total_amount >= 0),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  foreign key (variant_id, product_id) references public.product_variants(id, product_id) on delete restrict,
  check (line_total_amount = round((unit_price_amount - unit_discount_amount) * quantity, 2))
);
create index order_items_order_idx on public.order_items (order_id, created_at);

create table public.wishlist_items (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  product_id uuid not null references public.products(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (customer_id, product_id)
);
create index wishlist_items_customer_idx on public.wishlist_items (customer_id, created_at desc);

create table public.customer_notifications (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references auth.users(id) on delete cascade,
  notification_type text not null check (notification_type in ('order', 'payment', 'fulfillment', 'account')),
  title text not null check (char_length(title) between 1 and 160),
  message text not null check (char_length(message) between 1 and 2000),
  related_order_id uuid references public.orders(id) on delete set null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index customer_notifications_customer_idx on public.customer_notifications (customer_id, created_at desc);

alter table public.carts enable row level security;
alter table public.cart_items enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;
alter table public.wishlist_items enable row level security;
alter table public.customer_notifications enable row level security;

create policy "XSHOP customers read own carts" on public.carts for select to authenticated
using (customer_id = (select auth.uid()));
create policy "XSHOP customers read own cart items" on public.cart_items for select to authenticated
using (exists (select 1 from public.carts as cart where cart.id = cart_items.cart_id and cart.customer_id = (select auth.uid())));
create policy "XSHOP customers read own orders" on public.orders for select to authenticated
using (customer_id = (select auth.uid()));
create policy "XSHOP customers and order admins read order items" on public.order_items for select to authenticated
using (exists (
  select 1 from public.orders as order_record
  where order_record.id = order_items.order_id
    and (order_record.customer_id = (select auth.uid()) or (select private.user_has_any_role(array['admin', 'super_admin'])))
));
create policy "XSHOP customers manage own wishlist" on public.wishlist_items for select to authenticated
using (customer_id = (select auth.uid()));
create policy "XSHOP customers read own notifications" on public.customer_notifications for select to authenticated
using (customer_id = (select auth.uid()));
create policy "XSHOP customers mark own notifications read" on public.customer_notifications for update to authenticated
using (customer_id = (select auth.uid()))
with check (customer_id = (select auth.uid()));

revoke all on public.carts, public.cart_items, public.orders, public.order_items,
  public.wishlist_items, public.customer_notifications from anon, authenticated;
grant select on public.carts, public.cart_items, public.orders, public.order_items,
  public.wishlist_items, public.customer_notifications to authenticated;
grant update (read_at) on public.customer_notifications to authenticated;

create or replace function public.get_my_cart()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  customer uuid := (select auth.uid());
  result jsonb;
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;

  select jsonb_build_object(
    'items', coalesce(jsonb_agg(jsonb_build_object(
      'id', item.id,
      'product_id', item.product_id,
      'variant_id', item.variant_id,
      'quantity', item.quantity,
      'name', product.name,
      'slug', product.slug,
      'product_status', product.status,
      'currency_code', product.currency_code,
      'variant_name', variant.variant_name,
      'sku', variant.sku,
      'price_id', offer.price_id,
      'unit_price', offer.current_price,
      'original_unit_price', offer.original_price,
      'on_deal', coalesce(offer.has_active_deal and offer.current_price < offer.original_price, false),
      'available', coalesce(offer.is_available, false),
      'line_total', case when offer.current_price is null then null else round(offer.current_price * item.quantity, 2) end
    ) order by item.created_at) filter (where item.id is not null), '[]'::jsonb),
    'currency_code', case when count(distinct product.currency_code) = 1 then min(product.currency_code) else null end,
    'currency_mixed', count(distinct product.currency_code) > 1,
    'subtotal', case when count(distinct product.currency_code) <= 1 then coalesce(sum(offer.original_price * item.quantity), 0) else null end,
    'discount_total', case when count(distinct product.currency_code) <= 1 then coalesce(sum((offer.original_price - offer.current_price) * item.quantity), 0) else null end,
    'total', case when count(distinct product.currency_code) <= 1 then coalesce(sum(offer.current_price * item.quantity), 0) else null end
  )
  into result
  from public.carts as cart
  left join public.cart_items as item on item.cart_id = cart.id
  left join public.products as product on product.id = item.product_id
  left join public.product_variants as variant on variant.id = item.variant_id and variant.product_id = item.product_id
  left join public.catalog_current_offers as offer on offer.product_id = item.product_id and offer.variant_id is not distinct from item.variant_id
  where cart.customer_id = customer;

  return coalesce(result, jsonb_build_object('items', '[]'::jsonb, 'currency_code', null, 'currency_mixed', false, 'subtotal', 0, 'discount_total', 0, 'total', 0));
end;
$$;

create or replace function public.cart_add_item(_product_id uuid, _variant_id uuid, _quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer uuid := (select auth.uid());
  cart_key uuid;
  updated_quantity integer;
  selected_offer record;
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  if _quantity is null or _quantity < 1 or _quantity > 20 then raise exception 'Quantity must be between 1 and 20.' using errcode = '22023'; end if;

  select * into selected_offer from public.catalog_current_offers as offer
  where offer.product_id = _product_id and offer.variant_id is not distinct from _variant_id;
  if not found or not selected_offer.is_available then raise exception 'This product option is unavailable.' using errcode = 'P0001'; end if;

  insert into public.carts (customer_id) values (customer)
  on conflict (customer_id) do update set updated_at = now()
  returning id into cart_key;

  insert into public.cart_items as existing_item (cart_id, product_id, variant_id, quantity)
  values (cart_key, _product_id, _variant_id, _quantity)
  on conflict do update set quantity = existing_item.quantity + excluded.quantity, updated_at = now()
  returning quantity into updated_quantity;

  if updated_quantity > 20 then raise exception 'Cart quantity limit exceeded.' using errcode = '22023'; end if;
  if selected_offer.availability_mode = 'tracked' then
    if not exists (
      select 1 from public.product_prices as price
      where price.id = selected_offer.price_id and price.stock_on_hand >= updated_quantity
    ) then raise exception 'Requested quantity exceeds current availability.' using errcode = 'P0001'; end if;
  end if;

  return public.get_my_cart();
end;
$$;

create or replace function public.cart_update_item(_item_id uuid, _quantity integer)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  customer uuid := (select auth.uid());
  item_record record;
  selected_offer record;
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  if _quantity is null or _quantity < 1 or _quantity > 20 then raise exception 'Quantity must be between 1 and 20.' using errcode = '22023'; end if;

  select item.* into item_record
  from public.cart_items as item join public.carts as cart on cart.id = item.cart_id
  where item.id = _item_id and cart.customer_id = customer
  for update of item;
  if not found then raise exception 'Cart item not found.' using errcode = 'P0002'; end if;

  select * into selected_offer from public.catalog_current_offers as offer
  where offer.product_id = item_record.product_id and offer.variant_id is not distinct from item_record.variant_id;
  if not found or not selected_offer.is_available then raise exception 'This product option is unavailable.' using errcode = 'P0001'; end if;
  if selected_offer.availability_mode = 'tracked' and not exists (
    select 1 from public.product_prices as price where price.id = selected_offer.price_id and price.stock_on_hand >= _quantity
  ) then raise exception 'Requested quantity exceeds current availability.' using errcode = 'P0001'; end if;

  update public.cart_items set quantity = _quantity, updated_at = now() where id = _item_id;
  return public.get_my_cart();
end;
$$;

create or replace function public.cart_remove_item(_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare customer uuid := (select auth.uid());
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  delete from public.cart_items as item
  using public.carts as cart
  where item.cart_id = cart.id and item.id = _item_id and cart.customer_id = customer;
  return public.get_my_cart();
end;
$$;

create or replace function public.create_order_from_cart(_contact_email text, _idempotency_key uuid)
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
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  if _idempotency_key is null then raise exception 'An idempotency key is required.' using errcode = '22023'; end if;
  if _contact_email is null or char_length(btrim(_contact_email)) > 320 or btrim(_contact_email) !~* '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'Enter a valid delivery/contact email.' using errcode = '22023';
  end if;

  select * into existing_order from public.orders
  where customer_id = customer and idempotency_key = _idempotency_key;
  if found then
    return jsonb_build_object('order_id', existing_order.id, 'currency_code', existing_order.currency_code, 'subtotal', existing_order.subtotal_amount, 'discount_total', existing_order.discount_amount, 'total', existing_order.total_amount, 'payment_status', existing_order.payment_status, 'fulfillment_status', existing_order.fulfillment_status);
  end if;

  select cart.id into cart_key from public.carts as cart where cart.customer_id = customer for update;
  -- Recheck after locking the cart so concurrent retries with the same key return
  -- the order created by the transaction that acquired the lock first.
  select * into existing_order from public.orders
  where customer_id = customer and idempotency_key = _idempotency_key;
  if found then
    return jsonb_build_object('order_id', existing_order.id, 'currency_code', existing_order.currency_code, 'subtotal', existing_order.subtotal_amount, 'discount_total', existing_order.discount_amount, 'total', existing_order.total_amount, 'payment_status', existing_order.payment_status, 'fulfillment_status', existing_order.fulfillment_status);
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
  update public.orders
  set subtotal_amount = snapshot_subtotal,
      discount_amount = snapshot_discount_total,
      total_amount = snapshot_total
  where id = order_key;

  delete from public.cart_items where cart_id = cart_key;
  return jsonb_build_object('order_id', order_key, 'currency_code', order_currency, 'subtotal', snapshot_subtotal, 'discount_total', snapshot_discount_total, 'total', snapshot_total, 'payment_status', 'unpaid', 'fulfillment_status', 'not_eligible');
end;
$$;

create or replace function public.wishlist_add_product(_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare customer uuid := (select auth.uid());
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  if not exists (
    select 1 from public.products as product
    where product.id = _product_id and product.status = 'active' and product.visibility = 'public' and product.resale_rights_verified
  ) then raise exception 'Product is not available.' using errcode = 'P0001'; end if;
  insert into public.wishlist_items (customer_id, product_id) values (customer, _product_id)
  on conflict (customer_id, product_id) do nothing;
end;
$$;

create or replace function public.wishlist_remove_product(_product_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare customer uuid := (select auth.uid());
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  delete from public.wishlist_items where customer_id = customer and product_id = _product_id;
end;
$$;

create or replace function public.notification_mark_read(_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare customer uuid := (select auth.uid());
begin
  if customer is null then raise exception 'Authentication required.' using errcode = '28000'; end if;
  update public.customer_notifications
  set read_at = coalesce(read_at, now())
  where id = _notification_id and customer_id = customer;
end;
$$;

revoke all on function public.get_my_cart() from public;
revoke all on function public.cart_add_item(uuid, uuid, integer) from public;
revoke all on function public.cart_update_item(uuid, integer) from public;
revoke all on function public.cart_remove_item(uuid) from public;
revoke all on function public.create_order_from_cart(text, uuid) from public;
revoke all on function public.wishlist_add_product(uuid) from public;
revoke all on function public.wishlist_remove_product(uuid) from public;
revoke all on function public.notification_mark_read(uuid) from public;
grant execute on function public.get_my_cart() to authenticated;
grant execute on function public.cart_add_item(uuid, uuid, integer) to authenticated;
grant execute on function public.cart_update_item(uuid, integer) to authenticated;
grant execute on function public.cart_remove_item(uuid) to authenticated;
grant execute on function public.create_order_from_cart(text, uuid) to authenticated;
grant execute on function public.wishlist_add_product(uuid) to authenticated;
grant execute on function public.wishlist_remove_product(uuid) to authenticated;
grant execute on function public.notification_mark_read(uuid) to authenticated;

create trigger carts_set_updated_at before update on public.carts
for each row execute function private.set_updated_at();
create trigger cart_items_set_updated_at before update on public.cart_items
for each row execute function private.set_updated_at();
create trigger orders_set_updated_at before update on public.orders
for each row execute function private.set_updated_at();
commit;
