-- XSHOP Phase 3: database-backed public catalog.
-- No sample products, sale prices, or product media are seeded.

begin;

create table public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(btrim(name)) between 1 and 120),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  description text check (description is null or char_length(description) <= 2000),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  visibility text not null default 'private' check (visibility in ('public', 'unlisted', 'private')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  name text not null check (char_length(btrim(name)) between 1 and 180),
  short_description text check (short_description is null or char_length(short_description) <= 500),
  description text check (description is null or char_length(description) <= 12000),
  product_type text not null check (product_type in ('digital_code', 'gift_card', 'voucher', 'software_license', 'other_digital')),
  currency_code text not null check (currency_code ~ '^[A-Z]{3}$'),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  visibility text not null default 'private' check (visibility in ('public', 'unlisted', 'private')),
  resale_rights_verified boolean not null default false,
  resale_rights_verified_by uuid references auth.users(id) on delete set null,
  resale_rights_verified_at timestamptz,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (not resale_rights_verified or (resale_rights_verified_by is not null and resale_rights_verified_at is not null))
);

create table public.product_variants (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  variant_name text not null check (char_length(btrim(variant_name)) between 1 and 120),
  sku text unique check (sku is null or char_length(sku) <= 100),
  denomination_value numeric(18, 6) check (denomination_value is null or denomination_value > 0),
  status text not null default 'draft' check (status in ('draft', 'active', 'archived')),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, product_id)
);

-- A price row with a NULL variant_id represents a product without variants.
-- Variant products have a separate price row for each sellable variant.
create table public.product_prices (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  variant_id uuid,
  amount numeric(14, 2) not null check (amount > 0),
  availability_mode text not null default 'digital' check (availability_mode in ('unlimited', 'tracked', 'digital')),
  stock_on_hand integer,
  fulfillment_mode text not null default 'inventory' check (fulfillment_mode in ('inventory', 'manual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (variant_id, product_id) references public.product_variants(id, product_id) on delete restrict,
  check ((availability_mode = 'tracked' and stock_on_hand is not null and stock_on_hand >= 0)
      or (availability_mode <> 'tracked' and stock_on_hand is null)),
  check ((availability_mode = 'digital' and fulfillment_mode = 'inventory')
      or (availability_mode in ('unlimited', 'tracked') and fulfillment_mode = 'manual'))
);

create unique index product_prices_unvarianted_unique
  on public.product_prices (product_id) where variant_id is null;
create unique index product_prices_varianted_unique
  on public.product_prices (product_id, variant_id) where variant_id is not null;
create index product_prices_product_idx on public.product_prices (product_id, variant_id);

create table public.product_categories (
  product_id uuid not null references public.products(id) on delete cascade,
  category_id uuid not null references public.categories(id) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (product_id, category_id)
);
create index product_categories_category_idx on public.product_categories (category_id, product_id);

create table public.product_media (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid,
  bucket_id text not null default 'product-media' check (bucket_id = 'product-media'),
  object_path text not null check (object_path <> '' and object_path !~ '(^/|(^|/)\.\.?(/|$))'),
  alt_text text check (alt_text is null or char_length(alt_text) <= 300),
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  foreign key (variant_id, product_id) references public.product_variants(id, product_id) on delete restrict,
  unique (bucket_id, object_path)
);
create index product_media_product_idx on public.product_media (product_id, sort_order);

create table public.product_deals (
  id uuid primary key default gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete cascade,
  variant_id uuid,
  discount_type text not null check (discount_type in ('percent', 'amount')),
  discount_value numeric(14, 4) not null check (discount_value > 0),
  currency_code text,
  status text not null default 'draft' check (status in ('draft', 'active', 'inactive')),
  starts_at timestamptz,
  ends_at timestamptz,
  priority integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (variant_id, product_id) references public.product_variants(id, product_id) on delete restrict,
  check ((discount_type = 'percent' and currency_code is null and discount_value <= 100)
      or (discount_type = 'amount' and currency_code is not null and currency_code ~ '^[A-Z]{3}$')),
  check (ends_at is null or starts_at is null or ends_at > starts_at)
);
create index product_deals_product_active_idx on public.product_deals (product_id, status, starts_at, ends_at);
create index product_deals_variant_active_idx on public.product_deals (variant_id, status, starts_at, ends_at) where variant_id is not null;

-- This deliberately reveals only a boolean. Phase 6 replaces the digital-stock branch
-- to consult the private inventory table without exposing inventory records.
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
  price.created_at
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
  if sort_by not in ('relevant', 'newest', 'price_asc', 'price_desc') then
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
      jsonb_agg(jsonb_build_object(
        'price_id', offer.price_id,
        'variant_id', offer.variant_id,
        'variant_name', offer.variant_name,
        'sku', offer.sku,
        'denomination_value', offer.denomination_value,
        'price', offer.current_price,
        'original_price', offer.original_price,
        'on_deal', offer.has_active_deal and offer.current_price < offer.original_price,
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
      rollup.on_deal, rollup.is_available, rollup.price_options
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
    case when sort_by = 'relevant' then product.sort_order end asc,
    case when sort_by = 'newest' then product.created_at end desc,
    case when sort_by = 'relevant' then product.created_at end desc,
    product.name asc
  limit result_limit offset result_offset;
end;
$$;
revoke all on function public.search_catalog(text, text, numeric, numeric, text, boolean, boolean, text, text, text, integer, integer) from public;
grant execute on function public.search_catalog(text, text, numeric, numeric, text, boolean, boolean, text, text, text, integer, integer) to anon, authenticated;

-- Public read access is limited to approved, active, public records. Customer writes
-- are separately denied by policies and the role check, even with authenticated grants.
alter table public.categories enable row level security;
alter table public.products enable row level security;
alter table public.product_variants enable row level security;
alter table public.product_prices enable row level security;
alter table public.product_categories enable row level security;
alter table public.product_media enable row level security;
alter table public.product_deals enable row level security;

create policy "XSHOP public categories read" on public.categories for select to anon, authenticated
using (status = 'active' and visibility = 'public');
create policy "XSHOP catalog administrators manage categories" on public.categories for all to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])))
with check ((select private.user_has_any_role(array['admin', 'super_admin'])));

create policy "XSHOP public products read" on public.products for select to anon, authenticated
using (status = 'active' and visibility = 'public' and resale_rights_verified);
create policy "XSHOP catalog administrators manage products" on public.products for all to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])))
with check ((select private.user_has_any_role(array['admin', 'super_admin'])));

create policy "XSHOP public variants read" on public.product_variants for select to anon, authenticated
using (status = 'active' and exists (
  select 1 from public.products as product where product.id = product_variants.product_id
    and product.status = 'active' and product.visibility = 'public' and product.resale_rights_verified
));
create policy "XSHOP catalog administrators manage variants" on public.product_variants for all to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])))
with check ((select private.user_has_any_role(array['admin', 'super_admin'])));

create policy "XSHOP public prices read" on public.product_prices for select to anon, authenticated
using (exists (
  select 1 from public.products as product where product.id = product_prices.product_id
    and product.status = 'active' and product.visibility = 'public' and product.resale_rights_verified
));
create policy "XSHOP catalog administrators manage prices" on public.product_prices for all to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])))
with check ((select private.user_has_any_role(array['admin', 'super_admin'])));

create policy "XSHOP public product categories read" on public.product_categories for select to anon, authenticated
using (exists (
  select 1 from public.products as product where product.id = product_categories.product_id
    and product.status = 'active' and product.visibility = 'public' and product.resale_rights_verified
) and exists (
  select 1 from public.categories as category where category.id = product_categories.category_id
    and category.status = 'active' and category.visibility = 'public'
));
create policy "XSHOP catalog administrators manage product categories" on public.product_categories for all to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])))
with check ((select private.user_has_any_role(array['admin', 'super_admin'])));

create policy "XSHOP public product media read" on public.product_media for select to anon, authenticated
using (exists (
  select 1 from public.products as product where product.id = product_media.product_id
    and product.status = 'active' and product.visibility = 'public' and product.resale_rights_verified
));
create policy "XSHOP catalog administrators manage product media" on public.product_media for all to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])))
with check ((select private.user_has_any_role(array['admin', 'super_admin'])));

create policy "XSHOP active product deals read" on public.product_deals for select to anon, authenticated
using (status = 'active' and (starts_at is null or starts_at <= now()) and (ends_at is null or ends_at > now())
  and exists (
    select 1 from public.products as product where product.id = product_deals.product_id
      and product.status = 'active' and product.visibility = 'public' and product.resale_rights_verified
  ));
create policy "XSHOP catalog administrators manage deals" on public.product_deals for all to authenticated
using ((select private.user_has_any_role(array['admin', 'super_admin'])))
with check ((select private.user_has_any_role(array['admin', 'super_admin'])));

revoke all on public.categories, public.products, public.product_variants, public.product_prices,
  public.product_categories, public.product_media, public.product_deals from anon, authenticated;
grant select on public.categories, public.products, public.product_variants, public.product_prices,
  public.product_categories, public.product_media, public.product_deals to anon, authenticated;
grant insert, update, delete on public.categories, public.products, public.product_variants, public.product_prices,
  public.product_categories, public.product_media, public.product_deals to authenticated;

revoke all on public.catalog_current_offers from public, anon;
grant select on public.catalog_current_offers to anon, authenticated;

create trigger categories_set_updated_at before update on public.categories
for each row execute function private.set_updated_at();
create trigger products_set_updated_at before update on public.products
for each row execute function private.set_updated_at();
create trigger product_variants_set_updated_at before update on public.product_variants
for each row execute function private.set_updated_at();
create trigger product_prices_set_updated_at before update on public.product_prices
for each row execute function private.set_updated_at();
create trigger product_deals_set_updated_at before update on public.product_deals
for each row execute function private.set_updated_at();

commit;
