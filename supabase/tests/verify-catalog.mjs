// XSHOP storefront catalog verification (local, no credentials).
// Applies all migrations + supabase/seed.sql to embedded Postgres (PGlite),
// then exercises every storefront data path exactly as the UI calls it
// (catalogService.search params, listCategories, listCurrencies,
// getProductBySlug) plus gate/count/RLS/honesty assertions.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const testsDir = dirname(fileURLToPath(import.meta.url));
const migRoot = join(testsDir, '..', 'migrations');
const db = await PGlite.create();

let passed = 0;
let failed = 0;
const failures = [];
const section = (name) => console.log(`\n## ${name}`);
const assert = (name, condition, extra = '') => {
  if (condition) { passed += 1; console.log(`  ok - ${name}`); }
  else { failed += 1; failures.push(name); console.log(`  FAIL - ${name}${extra ? ` (${extra})` : ''}`); }
};
const exec = (sql) => db.exec(sql);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];
const asRole = async (role, userId = null) => {
  await exec(`reset role; reset app.actor_id;`);
  await exec(`set role ${role};`);
  if (userId) await exec(`set app.actor_id = '${userId}';`);
};
const asSuperuser = async () => { await exec(`reset role;`); await exec(`reset app.actor_id;`); };
const stripTxn = (sql) => sql.split('\n').filter((l) => !/^\s*(begin|commit)\s*;\s*$/i.test(l)).join('\n');
const rpcSearch = (a = {}) => q(
  `select * from public.search_catalog($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)`,
  [a.search_term ?? null, a.category_slug ?? null, a.min_price ?? null, a.max_price ?? null,
   a.currency ?? null, a.available_only ?? false, a.deals_only ?? false, a.product_type ?? null,
   a.slug ?? null, a.provider ?? null, a.denom_min ?? null, a.denom_max ?? null,
   a.worldwide ?? false, a.featured ?? false, a.sort ?? 'relevant', a.limit ?? 24, a.offset ?? 0]);

section('bootstrap shims');
await exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create schema storage;
  create table auth.users (id uuid primary key, email text, raw_user_meta_data jsonb not null default '{}'::jsonb);
  create or replace function auth.uid() returns uuid language sql stable as $$
    select nullif(current_setting('app.actor_id', true), '')::uuid $$;
  create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
  create table storage.objects (bucket_id text, name text);
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(text) returns text[] language sql immutable as $$ select string_to_array($1, '/') $$;
`);
assert('shims ready', true);

section('apply migrations');
for (const file of readdirSync(migRoot).filter((f) => f.endsWith('.sql')).sort()) {
  try { await exec(stripTxn(readFileSync(join(migRoot, file), 'utf8'))); console.log(`  ok - ${file}`); passed += 1; }
  catch (e) { console.log(`  FAIL - ${file}: ${String(e.message).split('\n')[0]}`); process.exit(1); }
}

section('test actors (harness-only, in-memory)');
const ADMIN = 'a1a1a1a1-1111-4111-8111-111111111111';
const ALICE = 'b2b2b2b2-2222-4222-8222-222222222222';
await asSuperuser();
await q(`insert into auth.users (id, email) values ($1, 'admin@xshop.test'), ($2, 'alice@xshop.test')`, [ADMIN, ALICE]);
await q(`update public.profiles set role = 'admin' where id = $1`, [ADMIN]);
assert('admin actor exists for seed verifier', true);

section('apply seed.sql');
try {
  await exec(stripTxn(readFileSync(join(testsDir, '..', 'seed.sql'), 'utf8')));
  assert('seed.sql applied', true);
} catch (e) {
  assert('seed.sql applied', false, String(e.message).split('\n')[0]);
  process.exit(1);
}
// Re-run proves idempotency (safe to execute twice).
try {
  await exec(stripTxn(readFileSync(join(testsDir, '..', 'seed.sql'), 'utf8')));
  assert('seed.sql re-run is safe (idempotent)', true);
} catch (e) {
  assert('seed.sql re-run is safe (idempotent)', false, String(e.message).split('\n')[0]);
}

section('seed counts (nothing fabricated beyond catalog rows)');
const counts = await one(`select
  (select count(*) from public.categories) as categories,
  (select count(*) from public.products) as products,
  (select count(*) from public.product_variants) as variants,
  (select count(*) from public.product_prices) as prices,
  (select count(*) from public.product_deals where status = 'active') as deals,
  (select count(*) from public.product_prices where availability_mode = 'digital') as digital_prices,
  (select count(*) from public.product_prices where availability_mode = 'unlimited' and fulfillment_mode = 'manual') as manual_prices,
  (select count(*) from public.digital_inventory) as inventory,
  (select count(*) from public.orders) as orders,
  (select count(*) from public.product_media) as media`);
assert('6 categories', Number(counts.categories) === 6, `got ${counts.categories}`);
assert('30 products', Number(counts.products) === 30, `got ${counts.products}`);
assert('102 variants', Number(counts.variants) === 102, `got ${counts.variants}`);
assert('102 prices', Number(counts.prices) === 102, `got ${counts.prices}`);
assert('8 active deals', Number(counts.deals) === 8, `got ${counts.deals}`);
assert('14 digital-mode prices', Number(counts.digital_prices) === 14, `got ${counts.digital_prices}`);
assert('88 manual/unlimited prices', Number(counts.manual_prices) === 88, `got ${counts.manual_prices}`);
assert('zero inventory rows (no fake codes)', Number(counts.inventory) === 0);
assert('zero orders (no fake transactions)', Number(counts.orders) === 0);
assert('zero media rows (placeholder UI, no broken images)', Number(counts.media) === 0);

section('visibility gate (every product publishable by the rules)');
const gate = await one(`select
  count(*) filter (where status = 'active' and visibility = 'public' and resale_rights_verified
    and resale_rights_verified_by is not null and resale_rights_verified_at is not null) as ok,
  count(*) as total from public.products`);
assert('all 30 products satisfy the gate', Number(gate.ok) === 30 && Number(gate.total) === 30);
const orphans = await one(`select count(*) as n from public.products p
  where not exists (select 1 from public.product_prices where product_id = p.id)
     or not exists (select 1 from public.product_categories where product_id = p.id)`);
assert('every product has a price and a category link', Number(orphans.n) === 0);
const badVariants = await one(`select count(*) as n from public.product_variants
  where status <> 'active' or denomination_value is null or denomination_value <= 0 or sku is null`);
assert('every variant active with denomination + sku', Number(badVariants.n) === 0);
const badCats = await one(`select count(*) as n from public.categories where status <> 'active' or visibility <> 'public'`);
assert('every category active + public', Number(badCats.n) === 0);

await asRole('anon');
section('/shop + home strip (default listing)');
let rows = await rpcSearch({ limit: 24, offset: 0 });
assert('first page holds 24 products', rows.length === 24, `got ${rows.length}`);
assert('total_count = 30', Number(rows[0]?.total_count) === 30);
assert('every row has slug/name/USD/options/categories',
  rows.every((r) => r.slug && r.name && r.currency_code === 'USD'
    && Array.isArray(r.price_options) && r.price_options.length > 0
    && Array.isArray(r.categories) && r.categories.length > 0));
assert('every price option is fully shaped (Phase B countdown key present)',
  rows.every((r) => r.price_options.every((o) => o.price_id && o.variant_id && o.variant_name
    && Number(o.denomination_value) > 0 && o.price != null && o.original_price != null
    && typeof o.available === 'boolean' && typeof o.on_deal === 'boolean'
    && Object.hasOwn(o, 'deal_ends_at'))));
assert('media arrays empty (UI placeholder path)', rows.every((r) => Array.isArray(r.media) && r.media.length === 0));
const home = await rpcSearch({ limit: 4, sort: 'relevant' });
assert('home strip returns 4 products', home.length === 4);

section('/categories + category detail data');
const cats = await q(`select id, name, slug, description, sort_order from public.categories
  where status = 'active' and visibility = 'public' order by sort_order, name`);
assert('6 public categories listed', cats.length === 6);
assert('categories carry name/slug/description', cats.every((c) => c.name && c.slug && c.description));
assert('category sort order respected', cats[0].slug === 'digital-gift-cards' && cats[5].slug === 'digital-subscriptions');
const oneCat = await one(`select id, name, slug, description from public.categories
  where slug = 'gaming-credits' and status = 'active' and visibility = 'public'`);
assert('getCategoryBySlug resolves gaming-credits', oneCat?.name === 'Gaming Credits');

section('/search');
let found = await rpcSearch({ search_term: 'steam', limit: 10 });
assert('search steam finds the Steam card', found.some((r) => r.slug === 'steam-gift-card'));
found = await rpcSearch({ search_term: 'NovaAI', limit: 10 });
assert('search NovaAI matches provider (credits + subscription)',
  found.length === 2 && found.some((r) => r.slug === 'novaai-api-credits')
  && found.some((r) => r.slug === 'novaai-pro-subscription'), found.map((r) => r.slug).join(','));
found = await rpcSearch({ search_term: 'xyznonexistent', limit: 10 });
assert('gibberish search returns nothing', found.length === 0);

section('/deals (original/current/discount/expiry)');
const deals = await rpcSearch({ deals_only: true, limit: 60 });
assert('8 deal products listed', deals.length === 8, deals.map((r) => r.slug).join(','));
assert('every deal row flagged on_deal', deals.every((r) => r.on_deal === true));
assert('deal options carry original > current + future expiry',
  deals.every((r) => r.price_options.filter((o) => o.on_deal).every((o) =>
    Number(o.original_price) > Number(o.price) && o.deal_ends_at != null
    && new Date(o.deal_ends_at).getTime() > Date.now())));
const steam = deals.find((r) => r.slug === 'steam-gift-card');
const steam40 = steam.price_options.find((o) => Number(o.denomination_value) === 40);
assert('Steam $40: 36.00 after 10% (10% discount, $4 savings)',
  Number(steam40.price) === 36 && Number(steam40.original_price) === 40);
const xbox = deals.find((r) => r.slug === 'xbox-gift-card');
assert('Xbox $8-amount deal subtracts exactly ($40 -> $32)',
  xbox.price_options.every((o) => Number(o.original_price) - Number(o.price) === 8));

section('category + type filters');
const gaming = await rpcSearch({ category_slug: 'gaming-credits', limit: 60 });
assert('gaming-credits filter returns 5', gaming.length === 5, gaming.map((r) => r.slug).join(','));
assert('filtered rows carry the category', gaming.every((r) => r.categories.some((c) => c.slug === 'gaming-credits')));
const giftType = await rpcSearch({ product_type: 'gift_card', limit: 60 });
assert('gift_card type spans gift + gaming cards (11)', giftType.length === 11, `got ${giftType.length}`);
const subs = await rpcSearch({ category_slug: 'digital-subscriptions', limit: 60 });
assert('subscriptions filter returns 5', subs.length === 5);

section('sorting (price/availability/newest/relevant)');
const asc = await rpcSearch({ sort: 'price_asc', limit: 60 });
const ascPrices = asc.map((r) => Number(r.display_price));
assert('price_asc is non-decreasing', ascPrices.every((p, i) => i === 0 || p >= ascPrices[i - 1]));
const desc = await rpcSearch({ sort: 'price_desc', limit: 60 });
const descPrices = desc.map((r) => Number(r.display_price));
assert('price_desc is non-increasing', descPrices.every((p, i) => i === 0 || p <= descPrices[i - 1]));
const newest = await rpcSearch({ sort: 'newest', limit: 60 });
assert('newest starts with streamwave-premium', newest[0]?.slug === 'streamwave-premium');
assert('newest is created_at descending',
  newest.every((r, i) => i === 0 || new Date(r.created_at) <= new Date(newest[i - 1].created_at)));
const relevant = await rpcSearch({ sort: 'relevant', limit: 60 });
const firstFive = relevant.slice(0, 5).map((r) => r.slug);
assert('relevant puts the 5 featured products first (sort_order)',
  JSON.stringify(firstFive) === JSON.stringify(['playstation-store-gift-card', 'steam-gift-card',
    'pixelforge-creative-annual', 'novaai-api-credits', 'streamwave-premium']), firstFive.join(','));

section('availability honesty (no fake inventory anywhere)');
const avail = await rpcSearch({ available_only: true, limit: 60 });
assert('available_only lists 27 (3 code-pipeline products hidden)', avail.length === 27, `got ${avail.length}`);
assert('nintendo/riot/blizzard absent while unstocked',
  !avail.some((r) => ['nintendo-eshop-card', 'riot-points-card', 'blizzard-balance-card'].includes(r.slug)));
const dq = await rpcSearch({ slug: 'dataquery-scale-credits', limit: 1 });
const dqAvail = dq[0].price_options.filter((o) => o.available).map((o) => Number(o.denomination_value));
const dqDark = dq[0].price_options.filter((o) => !o.available).map((o) => Number(o.denomination_value));
assert('dataquery standard tiers available, enterprise tiers dark until stocked',
  JSON.stringify(dqAvail) === JSON.stringify([200, 350, 500, 750, 1000])
  && JSON.stringify(dqDark) === JSON.stringify([1500, 2000, 2500, 3000]),
  `avail=${dqAvail} dark=${dqDark}`);
const nin = await rpcSearch({ slug: 'nintendo-eshop-card', limit: 1 });
assert('unstocked product reports is_available=false', nin[0].is_available === false);

section('Phase 9 discovery fields (ready for Phase B UI)');
const feat = await rpcSearch({ featured: true, limit: 60 });
assert('featured_only returns exactly the 5 featured', feat.length === 5);
const denom = await rpcSearch({ denom_min: 1500, denom_max: 3000, limit: 60 });
assert('denomination 1500-3000 isolates dataquery',
  denom.length === 1 && denom[0].slug === 'dataquery-scale-credits');
const prov = await rpcSearch({ provider: 'nintendo', limit: 60 });
assert('provider filter isolates nintendo', prov.length === 1 && prov[0].slug === 'nintendo-eshop-card');
const worldwide = await rpcSearch({ worldwide: true, limit: 60 });
assert('worldwide_only returns the 3 unrestricted products', worldwide.length === 3,
  worldwide.map((r) => r.slug).join(','));
const ranged = await rpcSearch({ min_price: 100, max_price: 200, currency: 'USD', limit: 60 });
assert('price range returns matches with an option in range',
  ranged.length > 0 && ranged.every((r) => r.price_options.some((o) =>
    Number(o.price) >= 100 && Number(o.price) <= 200)));
const eur = await rpcSearch({ currency: 'EUR', limit: 5 });
assert('EUR filter matches nothing (USD-only seed)', eur.length === 0);

section('product detail data (variants + merchandising metadata)');
const detail = await rpcSearch({ slug: 'novaai-api-credits', limit: 1 });
assert('detail resolves 6 denominations in order',
  JSON.stringify(detail[0].price_options.map((o) => Number(o.denomination_value)))
  === JSON.stringify([40, 80, 160, 200, 350, 500]));
const meta = await q(`select slug, provider_name, featured, terms, redemption_instructions,
  region_restrictions, delivery_method, delivery_eta, low_stock_threshold from public.products`);
assert('all 30 carry merchandising metadata',
  meta.length === 30 && meta.every((m) => m.provider_name && m.terms && m.redemption_instructions
    && m.delivery_method && m.delivery_eta));
assert('region set on 27, null (worldwide) on 3',
  meta.filter((m) => m.region_restrictions == null).length === 3
  && meta.filter((m) => m.region_restrictions != null).length === 27);
assert('low-stock threshold only on code-pipeline products',
  meta.filter((m) => m.low_stock_threshold === 5).length === 4);
const currencies = [...new Set((await q(`select currency_code from public.products
  where status = 'active' and visibility = 'public' and resale_rights_verified`)).map((r) => r.currency_code))];
assert('listCurrencies path yields USD only', JSON.stringify(currencies) === JSON.stringify(['USD']));

section('cart honesty (authenticated customer, no orders created)');
await asRole('authenticated', ALICE);
await asSuperuser();
const nvai40 = await one(`select id, product_id from public.product_variants where sku = 'NVAI-40'`);
const nes40 = await one(`select id, product_id from public.product_variants where sku = 'NES-40'`);
await asRole('authenticated', ALICE);
await q(`select public.cart_add_item($1, $2, 1)`, [nvai40.product_id, nvai40.id]);
const cart = await one(`select public.get_my_cart() as c`);
assert('available deal variant carts at deal price (36.00)', Number(cart.c.total) === 36, `got ${cart.c.total}`);
let blocked = false;
try { await q(`select public.cart_add_item($1, $2, 1)`, [nes40.product_id, nes40.id]); }
catch (e) { blocked = String(e.message).toLowerCase().includes('unavailable'); }
assert('unstocked digital variant cannot be carted', blocked);
await asSuperuser();
const cartOrders = await one(`select count(*) as n from public.orders`);
assert('verification created zero orders', Number(cartOrders.n) === 0);

section('RLS intact after seeding');
await asRole('anon');
let denied = false;
try { await q(`insert into public.products (slug, name, product_type, currency_code) values ('x', 'x', 'gift_card', 'USD')`); }
catch { denied = true; }
assert('anon cannot insert products', denied);
denied = false;
try { await q(`insert into public.categories (name, slug) values ('x', 'x')`); }
catch { denied = true; }
assert('anon cannot insert categories', denied);
denied = false;
try { await q(`update public.products set featured = true where slug = 'amazon-gift-card' returning id`); }
catch (e) { denied = String(e.message).toLowerCase().includes('denied'); }
assert('anon cannot update products', denied);

section('summary');
console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) { console.log(`failures: ${failures.join('; ')}`); process.exit(1); }
console.log('CATALOG VERIFIED');
