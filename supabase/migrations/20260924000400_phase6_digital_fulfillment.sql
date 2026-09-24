-- XSHOP Phase 6: private digital inventory, reservations, idempotent fulfillment, and delivery outbox.
-- Inventory is never seeded here and is never included by public catalog queries.

begin;

alter table public.payment_sessions add constraint payment_sessions_asset_network_check
  check (
    (asset_code = 'USDT' and network_code in ('TRC20', 'ERC20'))
    or (asset_code = 'USDC' and network_code = 'ERC20')
    or (asset_code = 'BTC' and network_code = 'Bitcoin')
    or (asset_code = 'ETH' and network_code = 'Ethereum')
    or (asset_code = 'TRX' and network_code = 'TRON')
    or (asset_code = 'LTC' and network_code = 'Litecoin')
  );

create table public.digital_inventory_batches (
  batch_id uuid primary key,
  product_price_id uuid not null references public.product_prices(id) on delete restrict,
  payload_count integer not null check (payload_count between 1 and 500),
  payload_fingerprint text not null check (payload_fingerprint ~ '^[a-f0-9]{32}$'),
  imported_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table public.digital_inventory (
  id uuid primary key default gen_random_uuid(),
  product_price_id uuid not null references public.product_prices(id) on delete restrict,
  delivery_payload jsonb not null check (
    jsonb_typeof(delivery_payload) in ('string', 'object', 'array')
    and pg_column_size(delivery_payload) <= 16384
    and (jsonb_typeof(delivery_payload) <> 'string' or char_length(btrim(delivery_payload #>> '{}')) > 0)
    and (jsonb_typeof(delivery_payload) <> 'object' or jsonb_object_length(delivery_payload) > 0)
    and (jsonb_typeof(delivery_payload) <> 'array' or jsonb_array_length(delivery_payload) > 0)
  ),
  import_batch_id uuid not null references public.digital_inventory_batches(batch_id) on delete restrict,
  batch_index integer not null check (batch_index > 0),
  status text not null default 'available' check (status in ('available', 'reserved', 'assigned', 'void')),
  reserved_order_id uuid references public.orders(id) on delete restrict,
  reserved_order_item_id uuid references public.order_items(id) on delete restrict,
  reserved_payment_session_id uuid references public.payment_sessions(id) on delete restrict,
  reservation_expires_at timestamptz,
  assigned_order_id uuid references public.orders(id) on delete restrict,
  assigned_order_item_id uuid references public.order_items(id) on delete restrict,
  assigned_at timestamptz,
  created_at timestamptz not null default now(),
  unique (import_batch_id, batch_index),
  check (
    (status = 'available' and reserved_order_id is null and reserved_order_item_id is null and reserved_payment_session_id is null and reservation_expires_at is null and assigned_order_id is null and assigned_order_item_id is null and assigned_at is null)
    or (status = 'reserved' and reserved_order_id is not null and reserved_order_item_id is not null and reserved_payment_session_id is not null and reservation_expires_at is not null and assigned_order_id is null and assigned_order_item_id is null and assigned_at is null)
    or (status = 'assigned' and reserved_order_id is null and reserved_order_item_id is null and reserved_payment_session_id is null and reservation_expires_at is null and assigned_order_id is not null and assigned_order_item_id is not null and assigned_at is not null)
    or (status = 'void' and assigned_order_id is null and assigned_order_item_id is null and assigned_at is null)
  )
);
create index digital_inventory_available_idx on public.digital_inventory (product_price_id, created_at, id) where status = 'available';
create index digital_inventory_reserved_session_idx on public.digital_inventory (reserved_payment_session_id) where status = 'reserved';
create index digital_inventory_assigned_order_idx on public.digital_inventory (assigned_order_id) where status = 'assigned';

create table public.inventory_reservations (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  product_price_id uuid not null references public.product_prices(id) on delete restrict,
  payment_session_id uuid not null references public.payment_sessions(id) on delete restrict,
  digital_inventory_id uuid references public.digital_inventory(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status text not null default 'reserved' check (status in ('reserved', 'released', 'assigned')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((digital_inventory_id is null and quantity > 0) or (digital_inventory_id is not null and quantity = 1)),
  unique (order_item_id, payment_session_id, digital_inventory_id)
);
create unique index inventory_reservations_live_digital_unique
  on public.inventory_reservations (digital_inventory_id)
  where digital_inventory_id is not null and status in ('reserved', 'assigned');
create unique index inventory_reservations_tracked_session_unique
  on public.inventory_reservations (order_item_id, payment_session_id)
  where digital_inventory_id is null and status in ('reserved', 'assigned');
create index inventory_reservations_order_idx on public.inventory_reservations (order_id, status);
create index inventory_reservations_session_idx on public.inventory_reservations (payment_session_id, status, expires_at);

create table public.fulfillments (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null unique references public.orders(id) on delete restrict,
  customer_id uuid not null references auth.users(id) on delete restrict,
  status text not null check (status in ('processing', 'manual_required', 'fulfilled', 'failed')),
  failure_code text check (failure_code is null or char_length(failure_code) <= 80),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  fulfilled_at timestamptz
);
create index fulfillments_customer_idx on public.fulfillments (customer_id, created_at desc);

create table public.fulfillment_items (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references public.fulfillments(id) on delete restrict,
  order_item_id uuid not null references public.order_items(id) on delete restrict,
  delivery_index integer not null check (delivery_index > 0),
  digital_inventory_id uuid references public.digital_inventory(id) on delete restrict,
  manual_delivery_content jsonb check (
    manual_delivery_content is null or (
      jsonb_typeof(manual_delivery_content) in ('string', 'object', 'array')
      and pg_column_size(manual_delivery_content) <= 16384
      and (jsonb_typeof(manual_delivery_content) <> 'string' or char_length(btrim(manual_delivery_content #>> '{}')) > 0)
      and (jsonb_typeof(manual_delivery_content) <> 'object' or jsonb_object_length(manual_delivery_content) > 0)
      and (jsonb_typeof(manual_delivery_content) <> 'array' or jsonb_array_length(manual_delivery_content) > 0)
    )
  ),
  created_at timestamptz not null default now(),
  unique (order_item_id, delivery_index),
  check ((digital_inventory_id is not null and manual_delivery_content is null)
      or (digital_inventory_id is null and manual_delivery_content is not null))
);
create unique index fulfillment_inventory_once_idx on public.fulfillment_items (digital_inventory_id) where digital_inventory_id is not null;
create index fulfillment_items_fulfillment_idx on public.fulfillment_items (fulfillment_id, order_item_id);

create table public.fulfillment_events (
  id uuid primary key default gen_random_uuid(),
  fulfillment_id uuid not null references public.fulfillments(id) on delete restrict,
  actor_id uuid references auth.users(id) on delete set null,
  event_type text not null check (event_type in ('eligible', 'reserved', 'assigned', 'manual_required', 'fulfilled', 'failed')),
  from_status text check (from_status is null or from_status in ('processing', 'manual_required', 'fulfilled', 'failed')),
  to_status text not null check (to_status in ('processing', 'manual_required', 'fulfilled', 'failed')),
  details jsonb not null default '{}'::jsonb check (pg_column_size(details) <= 4096),
  created_at timestamptz not null default now()
);
create index fulfillment_events_record_idx on public.fulfillment_events (fulfillment_id, created_at);

-- A future trusted worker can send these messages. No email is sent from the browser
-- and no delivery notice is queued before fulfillment actually succeeds.
create table public.fulfillment_email_outbox (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete restrict,
  event_type text not null check (event_type = 'fulfilled'),
  recipient_email text not null check (char_length(recipient_email) <= 320),
  payload jsonb not null check (pg_column_size(payload) <= 8192),
  status text not null default 'pending' check (status in ('pending', 'sent', 'failed')),
  attempts integer not null default 0 check (attempts >= 0),
  created_at timestamptz not null default now(),
  sent_at timestamptz,
  unique (order_id, event_type)
);

alter table public.digital_inventory_batches enable row level security;
alter table public.digital_inventory enable row level security;
alter table public.inventory_reservations enable row level security;
alter table public.fulfillments enable row level security;
alter table public.fulfillment_items enable row level security;
alter table public.fulfillment_events enable row level security;
alter table public.fulfillment_email_outbox enable row level security;

create policy "XSHOP admins manage private digital inventory" on public.digital_inventory for all to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])))
with check ((select private.user_has_any_role(array['admin', 'super_admin'])));
create policy "XSHOP customers read only their assigned digital delivery" on public.digital_inventory for select to authenticated
using (status = 'assigned' and exists (
  select 1 from public.orders as order_row
  where order_row.id = digital_inventory.assigned_order_id and order_row.customer_id = (select auth.uid())
));

create policy "XSHOP admins inspect inventory reservations" on public.inventory_reservations for select to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])));
create policy "XSHOP customers read own fulfillment" on public.fulfillments for select to authenticated
using (customer_id = (select auth.uid()));
create policy "XSHOP fulfillment admins inspect fulfillment" on public.fulfillments for select to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])));
create policy "XSHOP customers read own fulfillment items" on public.fulfillment_items for select to authenticated
using (exists (
  select 1 from public.fulfillments as fulfillment
  where fulfillment.id = fulfillment_items.fulfillment_id and fulfillment.customer_id = (select auth.uid())
));
create policy "XSHOP fulfillment admins inspect fulfillment items" on public.fulfillment_items for select to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])));
create policy "XSHOP customers read own fulfillment events" on public.fulfillment_events for select to authenticated
using (exists (
  select 1 from public.fulfillments as fulfillment
  where fulfillment.id = fulfillment_events.fulfillment_id and fulfillment.customer_id = (select auth.uid())
));
create policy "XSHOP fulfillment admins inspect events" on public.fulfillment_events for select to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])));

revoke all on public.digital_inventory_batches, public.digital_inventory, public.inventory_reservations,
  public.fulfillments, public.fulfillment_items, public.fulfillment_events, public.fulfillment_email_outbox from public, anon, authenticated;
grant select on public.digital_inventory, public.fulfillments, public.fulfillment_items, public.fulfillment_events to authenticated;
grant select on public.inventory_reservations to authenticated;
revoke all on public.fulfillment_email_outbox from public, anon, authenticated, service_role;
grant select on public.fulfillment_email_outbox to service_role;
grant update (status, attempts, sent_at) on public.fulfillment_email_outbox to service_role;

create or replace function public.catalog_option_available(_price_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when price.availability_mode = 'unlimited' then true
      when price.availability_mode = 'tracked' then price.stock_on_hand > 0
      when price.availability_mode = 'digital' then exists (
        select 1 from public.digital_inventory as inventory
        where inventory.product_price_id = price.id and inventory.status = 'available'
      ) or exists (
        select 1
        from public.digital_inventory as inventory
        join public.payment_sessions as session on session.id = inventory.reserved_payment_session_id
        where inventory.product_price_id = price.id
          and inventory.status = 'reserved'
          and inventory.reservation_expires_at <= now()
          and session.status = 'pending'
          and session.expires_at <= now()
      )
      else false
    end
    from public.product_prices as price
    join public.products as product on product.id = price.product_id
    where price.id = _price_id
      and product.status = 'active'
      and product.visibility = 'public'
      and product.resale_rights_verified
  ), false);
$$;
revoke all on function public.catalog_option_available(uuid) from public;
grant execute on function public.catalog_option_available(uuid) to anon, authenticated;

create or replace function public.admin_import_digital_inventory(_price_id uuid, _batch_id uuid, _payloads jsonb)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  inserted_count integer;
  batch_record public.digital_inventory_batches%rowtype;
  payload_fingerprint text;
begin
  if actor is null or not (select private.user_has_any_role(array['admin', 'super_admin'])) then
    raise exception 'Not authorized to import digital inventory.' using errcode = '42501';
  end if;
  if _batch_id is null or _payloads is null or jsonb_typeof(_payloads) is distinct from 'array' then
    raise exception 'Provide an idempotent batch id and a JSON array of delivery records.' using errcode = '22023';
  end if;
  if jsonb_array_length(_payloads) < 1 or jsonb_array_length(_payloads) > 500 then
    raise exception 'Provide between 1 and 500 delivery records.' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.product_prices as price join public.products as product on product.id = price.product_id
    where price.id = _price_id and price.availability_mode = 'digital' and price.fulfillment_mode = 'inventory'
      and product.status = 'active' and product.resale_rights_verified
  ) then raise exception 'The selected product option is not configured for digital inventory.' using errcode = 'P0001'; end if;
  if exists (
    select 1 from jsonb_array_elements(_payloads) as item(value)
    where jsonb_typeof(item.value) not in ('string', 'object', 'array')
      or case jsonb_typeof(item.value)
        when 'string' then char_length(btrim(item.value #>> '{}')) = 0
        when 'object' then jsonb_object_length(item.value) = 0
        when 'array' then jsonb_array_length(item.value) = 0
        else false
      end
      or pg_column_size(item.value) > 16384
  ) then raise exception 'Inventory entries must be non-empty JSON strings, objects, or arrays no larger than 16 KB.' using errcode = '22023'; end if;

  payload_fingerprint := md5(_payloads::text);
  insert into public.digital_inventory_batches (batch_id, product_price_id, payload_count, payload_fingerprint, imported_by)
  values (_batch_id, _price_id, jsonb_array_length(_payloads), payload_fingerprint, actor)
  on conflict (batch_id) do nothing;
  select * into batch_record from public.digital_inventory_batches as batch
  where batch.batch_id = _batch_id for update;
  if batch_record.product_price_id <> _price_id
    or batch_record.payload_count <> jsonb_array_length(_payloads)
    or batch_record.payload_fingerprint <> payload_fingerprint then
    raise exception 'This batch id was already used for a different inventory import.' using errcode = '22023';
  end if;

  insert into public.digital_inventory (product_price_id, delivery_payload, import_batch_id, batch_index)
  select _price_id, item.value, _batch_id, item.ordinality::integer
  from jsonb_array_elements(_payloads) with ordinality as item(value, ordinality)
  on conflict (import_batch_id, batch_index) do nothing;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

create or replace function private.reserve_order_inventory(_order_id uuid, _session_id uuid, _expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  inventory_record record;
  reserved_count integer;
begin
  for item in
    select order_item.id as order_item_id, order_item.product_price_id, order_item.quantity,
      price.availability_mode, price.fulfillment_mode, price.stock_on_hand
    from public.order_items as order_item
    join public.product_prices as price on price.id = order_item.product_price_id
    where order_item.order_id = _order_id
    order by order_item.id
    for update of price
  loop
    if item.fulfillment_mode = 'manual' and item.availability_mode = 'tracked' then
      update public.product_prices
      set stock_on_hand = stock_on_hand - item.quantity, updated_at = now()
      where id = item.product_price_id and stock_on_hand >= item.quantity;
      if not found then raise exception 'Insufficient stock for a requested item.' using errcode = 'P0001'; end if;
      insert into public.inventory_reservations (order_id, order_item_id, product_price_id, payment_session_id, quantity, status, expires_at)
      values (_order_id, item.order_item_id, item.product_price_id, _session_id, item.quantity, 'reserved', _expires_at);
    elsif item.availability_mode = 'digital' and item.fulfillment_mode = 'inventory' then
      reserved_count := 0;
      for inventory_record in
        select inventory.id from public.digital_inventory as inventory
        where inventory.product_price_id = item.product_price_id and inventory.status = 'available'
        order by inventory.created_at, inventory.id
        for update skip locked
        limit item.quantity
      loop
        update public.digital_inventory
        set status = 'reserved', reserved_order_id = _order_id, reserved_order_item_id = item.order_item_id,
          reserved_payment_session_id = _session_id, reservation_expires_at = _expires_at
        where id = inventory_record.id and status = 'available';
        if found then
          insert into public.inventory_reservations (order_id, order_item_id, product_price_id, payment_session_id, digital_inventory_id, quantity, status, expires_at)
          values (_order_id, item.order_item_id, item.product_price_id, _session_id, inventory_record.id, 1, 'reserved', _expires_at);
          reserved_count := reserved_count + 1;
        end if;
      end loop;
      if reserved_count <> item.quantity then raise exception 'Insufficient digital inventory for a requested item.' using errcode = 'P0001'; end if;
    end if;
  end loop;
end;
$$;

create or replace function private.release_payment_reservations(_session_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare reservation record;
begin
  for reservation in
    select * from public.inventory_reservations as item
    where item.payment_session_id = _session_id and item.status = 'reserved'
    for update
  loop
    if reservation.digital_inventory_id is not null then
      update public.digital_inventory
      set status = 'available', reserved_order_id = null, reserved_order_item_id = null,
        reserved_payment_session_id = null, reservation_expires_at = null
      where id = reservation.digital_inventory_id and status = 'reserved' and reserved_payment_session_id = _session_id;
    else
      update public.product_prices
      set stock_on_hand = stock_on_hand + reservation.quantity, updated_at = now()
      where id = reservation.product_price_id;
    end if;
    update public.inventory_reservations set status = 'released', updated_at = now() where id = reservation.id;
  end loop;
end;
$$;

create or replace function private.on_payment_session_terminal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.status in ('pending', 'submitted') and new.status in ('expired', 'rejected') then
    perform private.release_payment_reservations(new.id);
  end if;
  return new;
end;
$$;
revoke all on function private.on_payment_session_terminal() from public, anon, authenticated;
drop trigger if exists payment_session_release_reservation on public.payment_sessions;
create trigger payment_session_release_reservation
after update of status on public.payment_sessions
for each row execute function private.on_payment_session_terminal();

create or replace function private.expire_stale_payment_sessions()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_session record;
  expired_count integer := 0;
begin
  for expired_session in
    update public.payment_sessions as session
    set status = 'expired', updated_at = now()
    where session.status = 'pending' and session.expires_at <= now()
    returning session.id, session.order_id
  loop
    insert into public.payment_events (session_id, order_id, actor_id, event_type, from_status, to_status, details)
    values (expired_session.id, expired_session.order_id, null, 'expired', 'pending', 'expired', jsonb_build_object('automatic', true));
    update public.orders as order_row
    set payment_status = 'expired', fulfillment_status = 'not_eligible'
    where order_row.id = expired_session.order_id and order_row.payment_status = 'pending'
      and not exists (
        select 1 from public.payment_sessions as active
        where active.order_id = order_row.id and active.status in ('pending', 'submitted')
      );
    expired_count := expired_count + 1;
  end loop;
  return expired_count;
end;
$$;
revoke all on function private.expire_stale_payment_sessions() from public, anon, authenticated;

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
  select count(*)::integer into expired_count
  from public.payment_sessions as session
  where session.customer_id = customer and session.status = 'pending' and session.expires_at <= now();
  perform private.expire_stale_payment_sessions();
  return expired_count;
end;
$$;
revoke all on function public.expire_my_payment_sessions() from public;
grant execute on function public.expire_my_payment_sessions() to authenticated;

create or replace function private.fulfill_verified_order(_order_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  order_record public.orders%rowtype;
  fulfillment_id uuid;
  session_id uuid;
  item record;
  reserved record;
  delivery_index integer;
  reserved_count integer;
  needs_manual boolean := false;
  previous_status text;
begin
  select * into order_record from public.orders as order_row where order_row.id = _order_id for update;
  if not found or order_record.payment_status <> 'verified' then return; end if;

  insert into public.fulfillments (order_id, customer_id, status)
  values (_order_id, order_record.customer_id, 'processing')
  on conflict (order_id) do nothing;
  select fulfillment.id, fulfillment.status into fulfillment_id, previous_status
  from public.fulfillments as fulfillment where fulfillment.order_id = _order_id for update;
  if previous_status in ('fulfilled', 'manual_required') then return; end if;

  select session.id into session_id from public.payment_sessions as session
  where session.order_id = _order_id and session.status = 'verified'
  order by session.verified_at desc limit 1;

  begin
    for item in
      select order_item.id as order_item_id, order_item.quantity, price.id as price_id,
        price.availability_mode, price.fulfillment_mode
      from public.order_items as order_item
      join public.product_prices as price on price.id = order_item.product_price_id
      where order_item.order_id = _order_id
      order by order_item.id
      for update of order_item, price
    loop
      if item.fulfillment_mode = 'manual' then
        needs_manual := true;
        continue;
      end if;
      if item.availability_mode <> 'digital' or session_id is null then
        raise exception 'fulfillment_precondition_failed';
      end if;
      select count(*) into reserved_count
      from public.inventory_reservations as reservation
      where reservation.order_item_id = item.order_item_id and reservation.payment_session_id = session_id
        and reservation.status = 'reserved' and reservation.digital_inventory_id is not null;
      if reserved_count <> item.quantity then raise exception 'reserved_inventory_missing'; end if;

      delivery_index := 0;
      for reserved in
        select reservation.id as reservation_id, reservation.digital_inventory_id
        from public.inventory_reservations as reservation
        where reservation.order_item_id = item.order_item_id and reservation.payment_session_id = session_id
          and reservation.status = 'reserved' and reservation.digital_inventory_id is not null
        order by reservation.created_at, reservation.id
        for update
      loop
        delivery_index := delivery_index + 1;
        update public.digital_inventory
        set status = 'assigned', reserved_order_id = null, reserved_order_item_id = null,
          reserved_payment_session_id = null, reservation_expires_at = null,
          assigned_order_id = _order_id, assigned_order_item_id = item.order_item_id, assigned_at = now()
        where id = reserved.digital_inventory_id and status = 'reserved' and reserved_payment_session_id = session_id;
        if not found then raise exception 'reserved_inventory_changed'; end if;
        insert into public.fulfillment_items (fulfillment_id, order_item_id, delivery_index, digital_inventory_id)
        values (fulfillment_id, item.order_item_id, delivery_index, reserved.digital_inventory_id)
        on conflict (order_item_id, delivery_index) do nothing;
        update public.inventory_reservations set status = 'assigned', updated_at = now() where id = reserved.reservation_id;
      end loop;
    end loop;

    if needs_manual then
      update public.fulfillments set status = 'manual_required', updated_at = now() where id = fulfillment_id;
      update public.orders set fulfillment_status = 'manual_required' where id = _order_id;
      insert into public.fulfillment_events (fulfillment_id, event_type, from_status, to_status, details)
      values (fulfillment_id, 'manual_required', coalesce(previous_status, 'processing'), 'manual_required', '{}'::jsonb);
    else
      update public.fulfillments set status = 'fulfilled', fulfilled_at = now(), updated_at = now() where id = fulfillment_id;
      update public.orders set fulfillment_status = 'fulfilled' where id = _order_id;
      insert into public.fulfillment_events (fulfillment_id, event_type, from_status, to_status, details)
      values (fulfillment_id, 'fulfilled', coalesce(previous_status, 'processing'), 'fulfilled', '{}'::jsonb);
      insert into public.customer_notifications (customer_id, notification_type, title, message, related_order_id)
      values (order_record.customer_id, 'fulfillment', 'Digital order fulfilled', 'Your verified order is ready in your account.', _order_id);
      insert into public.fulfillment_email_outbox (order_id, event_type, recipient_email, payload)
      values (_order_id, 'fulfilled', order_record.contact_email, jsonb_build_object('order_id', _order_id, 'template', 'order_fulfilled'))
      on conflict (order_id, event_type) do nothing;
    end if;
  exception when others then
    update public.fulfillments set status = 'failed', failure_code = 'assignment_failed', updated_at = now() where id = fulfillment_id;
    update public.orders set fulfillment_status = 'failed' where id = _order_id;
    insert into public.fulfillment_events (fulfillment_id, event_type, from_status, to_status, details)
    values (fulfillment_id, 'failed', coalesce(previous_status, 'processing'), 'failed', jsonb_build_object('code', 'assignment_failed'));
  end;
end;
$$;

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
  expiration timestamptz := now() + interval '60 minutes';
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

create or replace function public.verify_payment_session(_session_id uuid, _approve boolean, _rejection_reason text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  session_record public.payment_sessions%rowtype;
  actor uuid := (select auth.uid());
  fulfillment_status text;
begin
  if actor is null or not (select private.user_has_any_role(array['admin', 'super_admin'])) then
    raise exception 'Not authorized to review payments.' using errcode = '42501';
  end if;
  if not _approve and char_length(btrim(coalesce(_rejection_reason, ''))) = 0 then
    raise exception 'A rejection reason is required.' using errcode = '22023';
  end if;
  select * into session_record from public.payment_sessions as session where session.id = _session_id for update;
  if not found then raise exception 'Payment session not found.' using errcode = 'P0002'; end if;
  if session_record.status = 'rejected' then
    select order_row.fulfillment_status into fulfillment_status from public.orders as order_row where order_row.id = session_record.order_id;
    return jsonb_build_object('session_id', session_record.id, 'order_id', session_record.order_id, 'status', session_record.status, 'fulfillment_status', fulfillment_status);
  elsif session_record.status = 'verified' then
    -- A retry may repair a failed assignment, while the fulfillment routine remains idempotent.
    perform private.fulfill_verified_order(session_record.order_id);
    select order_row.fulfillment_status into fulfillment_status from public.orders as order_row where order_row.id = session_record.order_id;
    return jsonb_build_object('session_id', session_record.id, 'order_id', session_record.order_id, 'status', session_record.status, 'fulfillment_status', fulfillment_status);
  end if;
  if session_record.status <> 'submitted' or session_record.transaction_hash is null then
    raise exception 'Only a submitted transaction can be reviewed.' using errcode = 'P0001';
  end if;

  if _approve then
    update public.payment_sessions set status = 'verified', verified_at = now(), verified_by = actor, updated_at = now()
    where id = _session_id;
    update public.orders set payment_status = 'verified', fulfillment_status = 'eligible' where id = session_record.order_id;
    insert into public.payment_events (session_id, order_id, actor_id, event_type, from_status, to_status, details)
    values (_session_id, session_record.order_id, actor, 'verified', 'submitted', 'verified', jsonb_build_object('manual_review', true));
    perform private.fulfill_verified_order(session_record.order_id);
    select order_row.fulfillment_status into fulfillment_status from public.orders as order_row where order_row.id = session_record.order_id;
    return jsonb_build_object('session_id', _session_id, 'order_id', session_record.order_id, 'status', 'verified', 'fulfillment_status', fulfillment_status);
  end if;

  update public.payment_sessions set status = 'rejected', verified_by = actor,
    rejection_reason = left(btrim(_rejection_reason), 1000), updated_at = now()
  where id = _session_id;
  update public.orders set payment_status = 'rejected', fulfillment_status = 'not_eligible' where id = session_record.order_id;
  insert into public.payment_events (session_id, order_id, actor_id, event_type, from_status, to_status, details)
  values (_session_id, session_record.order_id, actor, 'rejected', 'submitted', 'rejected', jsonb_build_object('reason', left(btrim(_rejection_reason), 500)));
  return jsonb_build_object('session_id', _session_id, 'order_id', session_record.order_id, 'status', 'rejected', 'fulfillment_status', 'not_eligible');
end;
$$;

create or replace function public.fulfillment_manual_complete(_order_id uuid, _deliveries jsonb)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := (select auth.uid());
  order_record public.orders%rowtype;
  fulfillment_id uuid;
  row_record record;
  payload_item jsonb;
  item_id uuid;
  item_quantity integer;
  expected_delivery_index integer;
  delivered_count integer;
begin
  if actor is null or not (select private.user_has_any_role(array['admin', 'super_admin'])) then
    raise exception 'Not authorized to complete fulfillment.' using errcode = '42501';
  end if;
  if _deliveries is null or jsonb_typeof(_deliveries) is distinct from 'array' then
    raise exception 'Provide a JSON array of fulfillment deliveries.' using errcode = '22023';
  end if;
  if jsonb_array_length(_deliveries) > 100 then
    raise exception 'The fulfillment delivery list is too large.' using errcode = '22023';
  end if;
  select * into order_record from public.orders as order_row where order_row.id = _order_id for update;
  if not found or order_record.payment_status <> 'verified' then raise exception 'Only a paid order is eligible for fulfillment.' using errcode = 'P0001'; end if;
  select id into fulfillment_id from public.fulfillments where order_id = _order_id and status = 'fulfilled' for update;
  if found then return fulfillment_id; end if;
  select id into fulfillment_id from public.fulfillments where order_id = _order_id and status = 'manual_required' for update;
  if not found then raise exception 'Order is not waiting for manual fulfillment.' using errcode = 'P0001'; end if;

  for row_record in select value from jsonb_array_elements(_deliveries)
  loop
    begin
      item_id := (row_record.value ->> 'order_item_id')::uuid;
    exception when others then
      raise exception 'A delivery references an invalid order item.' using errcode = '22023';
    end;
    select order_item.quantity into item_quantity
    from public.order_items as order_item
    join public.product_prices as price on price.id = order_item.product_price_id
    where order_item.id = item_id and order_item.order_id = _order_id and price.fulfillment_mode = 'manual';
    if not found then raise exception 'A delivery references an invalid manual item.' using errcode = '22023'; end if;
    if jsonb_typeof(row_record.value -> 'payloads') <> 'array'
      or jsonb_array_length(row_record.value -> 'payloads') <> item_quantity then
      raise exception 'Each manual item requires one delivery payload per purchased unit.' using errcode = '22023';
    end if;
    expected_delivery_index := 0;
    for payload_item in select value from jsonb_array_elements(row_record.value -> 'payloads')
    loop
      expected_delivery_index := expected_delivery_index + 1;
      if jsonb_typeof(payload_item) not in ('string', 'object', 'array')
        or case jsonb_typeof(payload_item)
          when 'string' then char_length(btrim(payload_item #>> '{}')) = 0
          when 'object' then jsonb_object_length(payload_item) = 0
          when 'array' then jsonb_array_length(payload_item) = 0
          else false
        end
        or pg_column_size(payload_item) > 16384 then
        raise exception 'Delivery payloads must be non-empty strings, objects, or arrays no larger than 16 KB.' using errcode = '22023';
      end if;
      insert into public.fulfillment_items (fulfillment_id, order_item_id, delivery_index, manual_delivery_content)
      values (fulfillment_id, item_id, expected_delivery_index, payload_item);
    end loop;
  end loop;

  select count(*) into delivered_count
  from public.fulfillment_items as delivery
  join public.order_items as item on item.id = delivery.order_item_id
  join public.product_prices as price on price.id = item.product_price_id
  where delivery.fulfillment_id = fulfillment_id and price.fulfillment_mode = 'manual';
  if delivered_count <> (
    select coalesce(sum(item.quantity), 0)
    from public.order_items as item join public.product_prices as price on price.id = item.product_price_id
    where item.order_id = _order_id and price.fulfillment_mode = 'manual'
  ) then raise exception 'Manual fulfillment is incomplete.' using errcode = 'P0001'; end if;

  update public.inventory_reservations as reservation set status = 'assigned', updated_at = now()
  from public.order_items as item
  where reservation.order_item_id = item.id and item.order_id = _order_id
    and reservation.status = 'reserved' and reservation.digital_inventory_id is null;
  update public.fulfillments set status = 'fulfilled', fulfilled_at = now(), updated_at = now() where id = fulfillment_id;
  update public.orders set fulfillment_status = 'fulfilled' where id = _order_id;
  insert into public.fulfillment_events (fulfillment_id, actor_id, event_type, from_status, to_status, details)
  values (fulfillment_id, actor, 'fulfilled', 'manual_required', 'fulfilled', jsonb_build_object('manual', true));
  insert into public.customer_notifications (customer_id, notification_type, title, message, related_order_id)
  values (order_record.customer_id, 'fulfillment', 'Digital order fulfilled', 'Your verified order is ready in your account.', _order_id);
  insert into public.fulfillment_email_outbox (order_id, event_type, recipient_email, payload)
  values (_order_id, 'fulfilled', order_record.contact_email, jsonb_build_object('order_id', _order_id, 'template', 'order_fulfilled'))
  on conflict (order_id, event_type) do nothing;
  return fulfillment_id;
end;
$$;

revoke all on function public.admin_import_digital_inventory(uuid, uuid, jsonb) from public;
revoke all on function public.fulfillment_manual_complete(uuid, jsonb) from public;
revoke all on function private.reserve_order_inventory(uuid, uuid, timestamptz) from public, anon, authenticated;
revoke all on function private.release_payment_reservations(uuid) from public, anon, authenticated;
revoke all on function private.fulfill_verified_order(uuid) from public, anon, authenticated;
revoke all on function public.create_payment_session(uuid, uuid) from public;
revoke all on function public.verify_payment_session(uuid, boolean, text) from public;
grant execute on function public.admin_import_digital_inventory(uuid, uuid, jsonb) to authenticated;
grant execute on function public.fulfillment_manual_complete(uuid, jsonb) to authenticated;
grant execute on function public.create_payment_session(uuid, uuid) to authenticated;
grant execute on function public.verify_payment_session(uuid, boolean, text) to authenticated;


create trigger fulfillments_set_updated_at before update on public.fulfillments
for each row execute function private.set_updated_at();
create trigger inventory_reservations_set_updated_at before update on public.inventory_reservations
for each row execute function private.set_updated_at();

commit;
