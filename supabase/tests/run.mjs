// XSHOP local database verification.
// Applies all migrations to embedded Postgres (PGlite) with minimal
// auth/storage shims, then runs the end-to-end business-logic suite.
// No credentials, no hosted project, nothing persisted.
import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'migrations');
const db = await PGlite.create();

let passed = 0;
let failed = 0;
const failures = [];
const section = (name) => console.log(`\n## ${name}`);
const assert = (name, condition, extra = '') => {
  if (condition) {
    passed += 1;
    console.log(`  ok - ${name}`);
  } else {
    failed += 1;
    failures.push(name);
    console.log(`  FAIL - ${name}${extra ? ` (${extra})` : ''}`);
  }
};

// ---------------------------------------------------------------------------
// Connection helpers. PGlite is a single connection, so role/user switching
// via SET faithfully exercises RLS + auth.uid() exactly like PostgREST.
// ---------------------------------------------------------------------------
const exec = (sql) => db.exec(sql);
const q = async (sql, params = []) => (await db.query(sql, params)).rows;
const one = async (sql, params = []) => (await db.query(sql, params)).rows[0];

const asRole = async (role, userId = null) => {
  await exec(`reset role; reset app.actor_id;`);
  await exec(`set role ${role};`);
  if (userId) await exec(`set app.actor_id = '${userId}';`);
};
const asSuperuser = async () => {
  await exec(`reset role;`);
  await exec(`reset app.actor_id;`);
};

const expectError = async (name, fn, needle = '') => {
  try {
    await fn();
    assert(name, false, 'expected an error but the call succeeded');
  } catch (error) {
    const message = String(error?.message ?? error);
    assert(
      name,
      needle === '' || message.toLowerCase().includes(needle.toLowerCase()),
      `wrong error: ${message.slice(0, 160)}`,
    );
  }
};

// ---------------------------------------------------------------------------
// 1. Minimal Supabase shims (auth users/uid, storage buckets/objects).
// ---------------------------------------------------------------------------
section('bootstrap shims');
await exec(`
  create role anon nologin;
  create role authenticated nologin;
  create role service_role nologin;
  create schema auth;
  create schema storage;
  create table auth.users (
    id uuid primary key,
    email text,
    raw_user_meta_data jsonb not null default '{}'::jsonb
  );
  create or replace function auth.uid() returns uuid
  language sql stable as $$
    select nullif(current_setting('app.actor_id', true), '')::uuid
  $$;
  create table storage.buckets (
    id text primary key,
    name text,
    public boolean,
    file_size_limit bigint,
    allowed_mime_types text[]
  );
  create table storage.objects (bucket_id text, name text);
  alter table storage.objects enable row level security;
  create or replace function storage.foldername(text) returns text[]
  language sql immutable as $$ select string_to_array($1, '/') $$;
`);
assert('shim roles/schemas/functions exist', true);

// ---------------------------------------------------------------------------
// 2. Apply every migration in filename order.
// ---------------------------------------------------------------------------
section('apply migrations');
const files = readdirSync(root).filter((f) => f.endsWith('.sql')).sort();
assert('migration files found', files.length >= 8, `found ${files.length}`);
for (const file of files) {
  const raw = readFileSync(join(root, file), 'utf8');
  // PGlite manages its own transaction per exec; explicit wrappers are for psql.
  const cleaned = raw
    .split('\n')
    .filter((line) => !/^\s*(begin|commit)\s*;\s*$/i.test(line))
    .join('\n');
  try {
    await exec(cleaned);
    console.log(`  ok - ${file}`);
    passed += 1;
  } catch (error) {
    failed += 1;
    failures.push(`migration ${file}`);
    console.log(`  FAIL - ${file}: ${String(error?.message ?? error).slice(0, 400)}`);
    break;
  }
}

// ---------------------------------------------------------------------------
// 3. Users + roles.
// ---------------------------------------------------------------------------
section('users and roles');
const ADMIN = '11111111-1111-1111-1111-111111111111';
const SUPPORT = '22222222-2222-2222-2222-222222222222';
const ALICE = '33333333-3333-3333-3333-333333333333';
const BOB = '44444444-4444-4444-4444-444444444444';

await asSuperuser();
await q(`insert into auth.users (id, email, raw_user_meta_data) values
  ($1, 'admin@xshop.test', '{"display_name":"Admin"}'),
  ($2, 'support@xshop.test', '{}'),
  ($3, 'alice@xshop.test', '{"display_name":"Alice"}'),
  ($4, 'bob@xshop.test', '{}')`, [ADMIN, SUPPORT, ALICE, BOB]);
await q(`update public.profiles set role = 'admin' where id = $1`, [ADMIN]);
await q(`update public.profiles set role = 'support' where id = $1`, [SUPPORT]);

const profiles = await q(`select id, role from public.profiles order by email`);
assert('signup trigger created 4 customer-default profiles (2 promoted)', profiles.length === 4);
assert('alice stayed customer', profiles.find((p) => p.id === ALICE)?.role === 'customer');

// ---------------------------------------------------------------------------
// 4. Catalog fixtures (created through RLS as the admin user).
// ---------------------------------------------------------------------------
section('catalog fixtures via RLS-as-admin');
await asRole('authenticated', ADMIN);
const cat = await one(`insert into public.categories (name, slug, status, visibility)
  values ('Gift Cards', 'gift-cards', 'active', 'public') returning id`);
const cat2 = await one(`insert into public.categories (name, slug, status, visibility)
  values ('Vouchers', 'vouchers', 'active', 'public') returning id`);
assert('admin can create categories', Boolean(cat?.id && cat2?.id));

const prod1 = await one(`insert into public.products
  (slug, name, short_description, product_type, currency_code, status, visibility,
   resale_rights_verified, resale_rights_verified_by, resale_rights_verified_at,
   provider_name, featured, terms, redemption_instructions, region_restrictions,
   delivery_method, delivery_eta, low_stock_threshold)
  values ('test-card', 'Test Card', 'A test listing', 'gift_card', 'USD', 'active', 'public',
   true, $1, now(),
   'Test Provider', true, 'Test terms.', 'Redeem in test settings.', 'United States only',
   'account_delivery', 'within minutes of verification', 2)
  returning id`, [ADMIN]);
assert('admin can create product with Phase 9 merchandising fields', Boolean(prod1?.id));

const prod2 = await one(`insert into public.products
  (slug, name, product_type, currency_code, status, visibility,
   resale_rights_verified, resale_rights_verified_by, resale_rights_verified_at, provider_name)
  values ('simple-voucher', 'Simple Voucher', 'voucher', 'USD', 'active', 'public',
   true, $1, now(), 'Other Provider')
  returning id`, [ADMIN]);
await one(`insert into public.products
  (slug, name, product_type, currency_code, status, visibility)
  values ('draft-thing', 'Draft Thing', 'voucher', 'USD', 'draft', 'private') returning id`);
assert('second public product + invisible draft created', Boolean(prod2?.id));

const var1 = await one(`insert into public.product_variants (product_id, variant_name, denomination_value, status)
  values ($1, '$40', 40, 'active') returning id`, [prod1.id]);
const var2 = await one(`insert into public.product_variants (product_id, variant_name, denomination_value, status, sort_order)
  values ($1, '$500', 500, 'active', 1) returning id`, [prod1.id]);
const price1 = await one(`insert into public.product_prices (product_id, variant_id, amount, availability_mode, fulfillment_mode)
  values ($1, $2, 40.00, 'digital', 'inventory') returning id`, [prod1.id, var1.id]);
const price2 = await one(`insert into public.product_prices (product_id, variant_id, amount, availability_mode, fulfillment_mode)
  values ($1, $2, 500.00, 'digital', 'inventory') returning id`, [prod1.id, var2.id]);
const priceSimple = await one(`insert into public.product_prices (product_id, amount, availability_mode, fulfillment_mode)
  values ($1, 10.00, 'unlimited', 'manual') returning id`, [prod2.id]);
assert('variants + prices created', Boolean(price1?.id && price2?.id && priceSimple?.id));

await q(`insert into public.product_categories (product_id, category_id) values ($1, $2)`, [prod1.id, cat.id]);
await q(`insert into public.product_categories (product_id, category_id) values ($1, $2)`, [prod2.id, cat2.id]);
await q(`insert into public.product_deals (product_id, discount_type, discount_value, status, ends_at, priority)
  values ($1, 'percent', 20, 'active', now() + interval '7 days', 0)`, [prod1.id]);
assert('category links + 20% deal created', true);

// ---------------------------------------------------------------------------
// 5. Public catalog: visibility gate + Phase 9 filters/sorts (as anon).
// ---------------------------------------------------------------------------
section('public catalog (anon)');
await asRole('anon');
const rpcSearch = async (args) => {
  const keys = Object.keys(args);
  const sql = `select * from public.search_catalog(${keys.map((k, i) => `${k} => $${i + 1}`).join(', ')})`;
  return q(sql, keys.map((k) => args[k]));
};

let res = await rpcSearch({ result_limit: 24, result_offset: 0 });
assert('anon sees exactly the 2 public products', res.length === 2, `got ${res.length}`);
assert('draft product excluded', !res.some((r) => r.slug === 'draft-thing'));
const card = res.find((r) => r.slug === 'test-card');
assert('deal price applied (40 -> 32)', Number(card.display_price) === 32, `got ${card?.display_price}`);
assert('price_options carry deal_ends_at', card.price_options.every((o) => o.deal_ends_at != null));
assert('digital option unavailable before inventory import',
  card.price_options.find((o) => o.variant_id === var1.id)?.available === false);

res = await rpcSearch({ provider_filter: 'test provider', result_limit: 10, result_offset: 0 });
assert('provider filter matches (case-insensitive)', res.length === 1 && res[0].slug === 'test-card');
res = await rpcSearch({ provider_filter: 'no-such-provider', result_limit: 10, result_offset: 0 });
assert('provider filter excludes non-matches', res.length === 0);
res = await rpcSearch({ worldwide_only: true, result_limit: 10, result_offset: 0 });
assert('worldwide_only returns only unrestricted product', res.length === 1 && res[0].slug === 'simple-voucher');
res = await rpcSearch({ featured_only: true, result_limit: 10, result_offset: 0 });
assert('featured_only returns only featured product', res.length === 1 && res[0].slug === 'test-card');
res = await rpcSearch({ denomination_min: 100, denomination_max: 1000, result_limit: 10, result_offset: 0 });
assert('denomination range matches $500-variant product', res.length === 1 && res[0].slug === 'test-card');
res = await rpcSearch({ denomination_min: 41, denomination_max: 499, result_limit: 10, result_offset: 0 });
assert('denomination range excludes out-of-range products', res.length === 0);
res = await rpcSearch({ sort_by: 'discount_desc', result_limit: 10, result_offset: 0 });
assert('discount_desc puts 20%-off product first', res[0]?.slug === 'test-card');
res = await rpcSearch({ sort_by: 'available_first', result_limit: 10, result_offset: 0 });
assert('available_first puts unlimited product before unavailable digital',
  res[0]?.slug === 'simple-voucher', `got ${res.map((r) => r.slug).join(',')}`);
res = await rpcSearch({ search_term: 'Test Provider', result_limit: 10, result_offset: 0 });
assert('free-text search matches provider name', res.length === 1 && res[0].slug === 'test-card');

const anonProducts = await q(`select slug from public.products order by slug`);
assert('anon direct read sees only public products',
  anonProducts.length === 2 && anonProducts[0].slug === 'simple-voucher');
await expectError('anon cannot insert categories', async () => {
  await q(`insert into public.categories (name, slug) values ('Hack', 'hack')`);
}, 'denied');
await expectError('invalid sort rejected', () => rpcSearch({ sort_by: 'popular', result_limit: 5, result_offset: 0 }), 'sort');
await expectError('negative denomination rejected', () => rpcSearch({ denomination_min: -1, result_limit: 5, result_offset: 0 }), 'denomination');

// ---------------------------------------------------------------------------
// 6. Digital inventory import (idempotent batches).
// ---------------------------------------------------------------------------
section('digital inventory import');
await asRole('authenticated', ADMIN);
const BATCH = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const imported = await one(`select public.admin_import_digital_inventory($1, $2, $3) as n`,
  [price1.id, BATCH, JSON.stringify(['CODE-1', 'CODE-2', 'CODE-3'])]);
assert('imported 3 codes', imported.n === 3, `got ${imported.n}`);
const reimport = await one(`select public.admin_import_digital_inventory($1, $2, $3) as n`,
  [price1.id, BATCH, JSON.stringify(['CODE-1', 'CODE-2', 'CODE-3'])]);
assert('batch re-import is idempotent (0 new)', reimport.n === 0);
await expectError('batch id reuse for a different price rejected', async () => {
  await q(`select public.admin_import_digital_inventory($1, $2, $3)`,
    [price2.id, BATCH, JSON.stringify(['OTHER-1'])]);
}, 'different inventory import');
await asRole('authenticated', ALICE);
await expectError('customer cannot import inventory', async () => {
  await q(`select public.admin_import_digital_inventory($1, $2, $3)`,
    [price1.id, 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb', JSON.stringify(['X'])]);
}, 'not authorized');

await asRole('anon');
res = await rpcSearch({ slug_filter: 'test-card', result_limit: 1, result_offset: 0 });
assert('digital option available after import',
  res[0].price_options.find((o) => o.variant_id === var1.id)?.available === true);

// ---------------------------------------------------------------------------
// 7. Cart + coupons (order-wide, category-scoped, product-scoped).
// ---------------------------------------------------------------------------
section('cart and coupons');
await asRole('authenticated', ALICE);
await q(`select public.cart_add_item($1, $2, 2)`, [prod1.id, var1.id]);
await expectError('variant without inventory cannot be carted', async () => {
  await q(`select public.cart_add_item($1, $2, 1)`, [prod1.id, var2.id]);
}, 'available');
await q(`select public.cart_add_item($1, null, 1)`, [prod2.id]);
let cart = await one(`select public.get_my_cart() as c`);
assert('cart holds 2 lines totaling 74.00', Number(cart.c.total) === 74, `got ${cart.c.total}`);

await asRole('authenticated', ADMIN);
await q(`insert into public.coupons (code, discount_type, discount_value, status) values ('SAVE10', 'percent', 10, 'active')`);
const scopedCoupon = await one(`insert into public.coupons (code, discount_type, discount_value, status) values ('HALFV', 'percent', 50, 'active') returning id`);
await q(`insert into public.coupon_categories (coupon_id, category_id) values ($1, $2)`, [scopedCoupon.id, cat2.id]);
const prodCoupon = await one(`insert into public.coupons (code, discount_type, discount_value, status) values ('ONLYCARD', 'percent', 25, 'active') returning id`);
await q(`insert into public.coupon_products (coupon_id, product_id) values ($1, $2)`, [prodCoupon.id, prod1.id]);

await asRole('authenticated', ALICE);
let preview = await one(`select public.preview_coupon('SAVE10') as p`);
assert('order-wide 10% preview = 7.40', Number(preview.p.discount) === 7.4, `got ${preview.p.discount}`);
preview = await one(`select public.preview_coupon('HALFV') as p`);
assert('category-scoped 50% preview applies to voucher line only (5.00)',
  Number(preview.p.discount) === 5, `got ${preview.p.discount}`);
preview = await one(`select public.preview_coupon('ONLYCARD') as p`);
assert('product-scoped 25% preview applies to card lines only (16.00)',
  Number(preview.p.discount) === 16, `got ${preview.p.discount}`);
await q(`select public.cart_remove_item($1)`, [cart.c.items.find((i) => i.product_id === prod2.id).id]);
await expectError('scoped coupon rejected when no line matches', async () => {
  await q(`select public.preview_coupon('HALFV')`);
}, 'does not apply');
await q(`select public.cart_add_item($1, null, 1)`, [prod2.id]);

// ---------------------------------------------------------------------------
// 8. Order creation with a scoped coupon.
// ---------------------------------------------------------------------------
section('order creation');
const KEY1 = 'c001c001-c001-c001-c001-c001c001c001';
const created = await one(`select public.create_order_from_cart('alice@xshop.test', $1, 'HALFV', 0) as o`, [KEY1]);
assert('order total = 74 - 5 scoped = 69', Number(created.o.total) === 69, JSON.stringify(created.o));
assert('coupon discount recorded', Number(created.o.coupon_discount) === 5);
assert('order number issued in XS-XXXXXXXX form', /^XS-[0-9A-F]{8}$/.test(created.o.order_number), created.o.order_number);
const ORDER1 = created.o.order_id;
const retry = await one(`select public.create_order_from_cart('alice@xshop.test', $1, 'HALFV', 0) as o`, [KEY1]);
assert('idempotent retry returns the same order', retry.o.order_id === ORDER1 && retry.o.order_number === created.o.order_number);
cart = await one(`select public.get_my_cart() as c`);
assert('cart cleared after order', cart.c.items.length === 0);
await asSuperuser();
const redemption = await one(`select status, amount_applied from public.coupon_redemptions where order_id = $1`, [ORDER1]);
assert('redemption applied at 5.00', redemption?.status === 'applied' && Number(redemption.amount_applied) === 5);
const orderRow = await one(`select order_number from public.orders where id = $1`, [ORDER1]);
assert('order_number persisted', orderRow.order_number === created.o.order_number);

// ---------------------------------------------------------------------------
// 9. Payments: method config, sessions, review aids, approval, fulfillment.
// ---------------------------------------------------------------------------
section('payments and fulfillment');
await asRole('authenticated', ADMIN);
const usdt = await one(`insert into public.payment_methods
  (asset_code, network_code, display_name, fiat_currency_code, crypto_units_per_fiat, asset_decimals,
   receiving_address, status, expires_after_minutes, display_order, instructions)
  values ('USDT', 'TRC20', 'Tether TRC20', 'USD', 1, 6, 'TX-test-receiving-address-1', 'active', 30, 1, 'Send exactly the quoted amount.')
  returning id`);
await q(`insert into public.payment_methods
  (asset_code, network_code, display_name, fiat_currency_code, crypto_units_per_fiat, asset_decimals,
   receiving_address, status, min_order_amount, display_order)
  values ('BTC', 'Bitcoin', 'Bitcoin', 'USD', 0.00005, 8, 'bc1-test-address', 'active', 10000, 0)`);
const btc = await one(`select id from public.payment_methods where asset_code = 'BTC'`);

await asRole('authenticated', ALICE);
await expectError('method minimum enforced', async () => {
  await q(`select public.create_payment_session($1, $2)`, [ORDER1, btc.id]);
}, 'below the minimum');
const sess = await one(`select public.create_payment_session($1, $2) as id`, [ORDER1, usdt.id]);
const SESSION1 = sess.id;
const sessRow = await one(`select expected_amount, expires_at, created_at, review_state from public.payment_sessions where id = $1`, [SESSION1]);
const lifetimeMin = (new Date(sessRow.expires_at) - new Date(sessRow.created_at)) / 60000;
assert('session honors 30-minute method expiry', lifetimeMin > 29 && lifetimeMin < 31, `${lifetimeMin}`);
assert('quote = 69 USDT at rate 1', Number(sessRow.expected_amount) === 69);
assert('review_state defaults to none', sessRow.review_state === 'none');

await asSuperuser();
const resCount = await one(`select count(*) as n from public.inventory_reservations where payment_session_id = $1 and status = 'reserved'`, [SESSION1]);
assert('2 digital units reserved (manual unlimited needs none)', Number(resCount.n) === 2);

await asRole('authenticated', ALICE);
const sameSess = await one(`select public.create_payment_session($1, $2) as id`, [ORDER1, usdt.id]);
assert('same-method retry returns active session', sameSess.id === SESSION1);
await expectError('different method blocked while session live', async () => {
  await q(`select public.create_payment_session($1, $2)`, [ORDER1, btc.id]);
}, 'already exists');

const HASH = 'ab'.repeat(32);
const submitted = await one(`select public.submit_payment_transaction($1, $2) as r`, [SESSION1, HASH]);
assert('hash submit -> submitted', submitted.r.status === 'submitted');
await asRole('authenticated', BOB);
await expectError('bob cannot submit to alice session', async () => {
  await q(`select public.submit_payment_transaction($1, $2)`, [SESSION1, 'cd'.repeat(32)]);
}, 'not found');

await asRole('authenticated', ADMIN);
const noteId = await one(`select public.admin_add_payment_note($1, 'Checking explorer now.') as id`, [SESSION1]);
assert('admin note recorded', Boolean(noteId?.id));
const state = await one(`select public.admin_set_payment_review_state($1, 'under_review') as s`, [SESSION1]);
assert('marked under review', state.s === 'under_review');
const notes = await q(`select note from public.payment_review_notes where session_id = $1`, [SESSION1]);
assert('admin can read notes', notes.length === 1);
const reviewEvents = await q(`select event_type from public.payment_events where session_id = $1`, [SESSION1]);
assert('note + review-state transitions enter payment history',
  reviewEvents.some((e) => e.event_type === 'note_added')
  && reviewEvents.some((e) => e.event_type === 'review_state_changed'));
await asRole('authenticated', ALICE);
await expectError('customer cannot add payment notes', async () => {
  await q(`select public.admin_add_payment_note($1, 'self approve')`, [SESSION1]);
}, 'not authorized');
const aliceNotes = await q(`select * from public.payment_review_notes where session_id = $1`, [SESSION1]);
assert('customer cannot read review notes', aliceNotes.length === 0);

await asRole('authenticated', ADMIN);
const verdict = await one(`select public.verify_payment_session($1, true, null) as r`, [SESSION1]);
assert('approval verifies + routes to manual (mixed order)',
  verdict.r.status === 'verified' && verdict.r.fulfillment_status === 'manual_required',
  JSON.stringify(verdict.r));
const verdictAgain = await one(`select public.verify_payment_session($1, true, null) as r`, [SESSION1]);
assert('re-approval is idempotent', verdictAgain.r.status === 'verified');

await asSuperuser();
const items1 = await q(`select id, product_id from public.order_items where order_id = $1 order by created_at`, [ORDER1]);
const manualItem = items1.find((i) => i.product_id === prod2.id);
await asRole('authenticated', ADMIN);
const deliveries = JSON.stringify([{ order_item_id: manualItem.id, payloads: ['MANUAL-VOUCHER-1'] }]);
const fulfId = await one(`select public.fulfillment_manual_complete($1, $2) as id`, [ORDER1, deliveries]);
assert('manual completion recorded', Boolean(fulfId?.id));

await asSuperuser();
const final1 = await one(`select payment_status, fulfillment_status from public.orders where id = $1`, [ORDER1]);
assert('order1 verified + fulfilled', final1.payment_status === 'verified' && final1.fulfillment_status === 'fulfilled');
const assigned = await one(`select count(*) as n from public.digital_inventory where assigned_order_id = $1 and status = 'assigned'`, [ORDER1]);
assert('2 digital units assigned exactly once', Number(assigned.n) === 2);
const outbox = await one(`select payload, status from public.fulfillment_email_outbox where order_id = $1`, [ORDER1]);
assert('outbox enriched with order number + items + path',
  outbox?.status === 'pending'
  && outbox.payload.order_number === created.o.order_number
  && outbox.payload.items?.length === 2
  && outbox.payload.order_url_path === `/account/orders/${ORDER1}`,
  JSON.stringify(outbox?.payload).slice(0, 200));
const redemption1 = await one(`select status from public.coupon_redemptions where order_id = $1`, [ORDER1]);
assert('coupon redemption confirmed on verification', redemption1?.status === 'confirmed');
const earn = await one(`select points_delta from public.reward_transactions where related_order_id = $1 and entry_type = 'earn'`, [ORDER1]);
assert('69 reward points earned (69 x rate 1)', earn?.points_delta === 69, `got ${earn?.points_delta}`);

// ---------------------------------------------------------------------------
// 10. Rejection releases reservations.
// ---------------------------------------------------------------------------
section('rejection releases reservations');
await asRole('authenticated', ALICE);
await q(`select public.cart_add_item($1, $2, 1)`, [prod1.id, var1.id]);
const KEY2 = 'c002c002-c002-c002-c002-c002c002c002';
const created2 = await one(`select public.create_order_from_cart('alice@xshop.test', $1, null, 0) as o`, [KEY2]);
const ORDER2 = created2.o.order_id;
assert('order2 total 32 (no coupon)', Number(created2.o.total) === 32);
assert('order2 number differs from order1', created2.o.order_number !== created.o.order_number);
const sess2 = await one(`select public.create_payment_session($1, $2) as id`, [ORDER2, usdt.id]);
await q(`select public.submit_payment_transaction($1, $2)`, [sess2.id, 'ef'.repeat(32)]);
await asRole('authenticated', ADMIN);
const rej = await one(`select public.verify_payment_session($1, false, 'No matching transfer found.') as r`, [sess2.id]);
assert('rejection recorded', rej.r.status === 'rejected');
await asSuperuser();
const availAfterReject = await one(`select count(*) as n from public.digital_inventory where status = 'available'`);
assert('rejected reservation released (1 available)', Number(availAfterReject.n) === 1, `got ${availAfterReject.n}`);

// ---------------------------------------------------------------------------
// 11. Expiry releases reservations (server clock).
// ---------------------------------------------------------------------------
section('expiry releases reservations');
await asRole('authenticated', ALICE);
await q(`select public.cart_add_item($1, $2, 1)`, [prod1.id, var1.id]);
const KEY3 = 'c003c003-c003-c003-c003-c003c003c003';
const created3 = await one(`select public.create_order_from_cart('alice@xshop.test', $1, null, 0) as o`, [KEY3]);
const sess3 = await one(`select public.create_payment_session($1, $2) as id`, [created3.o.order_id, usdt.id]);
await asSuperuser();
await q(`update public.payment_sessions set created_at = now() - interval '2 hours', expires_at = now() - interval '1 hour' where id = $1`, [sess3.id]);
await asRole('authenticated', ALICE);
const expiredCount = await one(`select public.expire_my_payment_sessions() as n`);
assert('one stale session expired', expiredCount.n === 1, `got ${expiredCount.n}`);
const sess3Row = await one(`select status from public.payment_sessions where id = $1`, [sess3.id]);
assert('session marked expired', sess3Row.status === 'expired');
const order3Row = await one(`select payment_status from public.orders where id = $1`, [created3.o.order_id]);
assert('order marked payment-expired', order3Row.payment_status === 'expired');
await asSuperuser();
const availAfterExpiry = await one(`select count(*) as n from public.digital_inventory where status = 'available'`);
assert('expired reservation released (1 available)', Number(availAfterExpiry.n) === 1);

// ---------------------------------------------------------------------------
// 12. Rewards redeem, referral guard, wishlist, notifications.
// ---------------------------------------------------------------------------
section('rewards, referrals, wishlist, notifications');
await asRole('authenticated', ALICE);
const rewards = await one(`select public.get_my_rewards() as r`);
assert('rewards balance is 69', Number(rewards.r.balance) === 69, `got ${rewards.r.balance}`);
await q(`select public.cart_add_item($1, null, 1)`, [prod2.id]);
const KEY4 = 'c004c004-c004-c004-c004-c004c004c004';
const created4 = await one(`select public.create_order_from_cart('alice@xshop.test', $1, null, 50) as o`, [KEY4]);
assert('50 points redeemed for 0.50 off (total 9.50)',
  Number(created4.o.total) === 9.5 && Number(created4.o.reward_discount) === 0.5,
  JSON.stringify(created4.o));
await q(`select public.cart_add_item($1, null, 1)`, [prod2.id]);
await expectError('cannot overspend points', async () => {
  await q(`select public.create_order_from_cart('alice@xshop.test', 'c005c005-c005-c005-c005-c005c005c005', null, 999999)`);
}, 'do not have that many');

const myCode = await one(`select public.get_my_referral_code() as r`);
assert('referral code issued', typeof myCode.r.code === 'string' && myCode.r.code.length >= 6);
await expectError('existing customer cannot apply any code', async () => {
  await q(`select public.apply_referral_code($1)`, [myCode.r.code]);
}, 'new customers');
await asRole('authenticated', BOB);
const bobCode = await one(`select public.get_my_referral_code() as r`);
await expectError('self-referral rejected without leaking ownership', async () => {
  await q(`select public.apply_referral_code($1)`, [bobCode.r.code]);
}, 'Enter a valid referral code');
await asRole('authenticated', ALICE);

await q(`select public.wishlist_add_product($1)`, [prod1.id]);
const wish = await q(`select * from public.wishlist_items where customer_id = $1`, [ALICE]);
assert('wishlist holds 1 item', wish.length === 1);
await q(`select public.wishlist_remove_product($1)`, [prod1.id]);
const notifs = await q(`select notification_type from public.customer_notifications where customer_id = $1`, [ALICE]);
assert('lifecycle notifications exist (order/payment/fulfillment)',
  notifs.some((n) => n.notification_type === 'order')
  && notifs.some((n) => n.notification_type === 'payment')
  && notifs.some((n) => n.notification_type === 'fulfillment'));
const unread = await one(`select id from public.customer_notifications where customer_id = $1 and read_at is null limit 1`, [ALICE]);
await q(`select public.notification_mark_read($1)`, [unread.id]);
const readBack = await one(`select read_at from public.customer_notifications where id = $1`, [unread.id]);
assert('notification marked read', readBack.read_at != null);

// ---------------------------------------------------------------------------
// 13. RLS isolation + staff roles.
// ---------------------------------------------------------------------------
section('RLS isolation and staff roles');
await asRole('authenticated', BOB);
const bobOrders = await q(`select id from public.orders`);
assert('bob sees zero orders (owner isolation)', bobOrders.length === 0);
const bobPeek = await q(`select id from public.orders where id = $1`, [ORDER1]);
assert('bob cannot read alice order by id', bobPeek.length === 0);
const bobCoupons = await q(`select * from public.coupons`);
assert('coupons invisible to customers', bobCoupons.length === 0);
const bobScope = await q(`select * from public.coupon_products`);
assert('coupon scope invisible to customers', bobScope.length === 0);
const bobInventory = await q(`select * from public.digital_inventory`);
assert('inventory invisible to customers', bobInventory.length === 0);

await asRole('authenticated', SUPPORT);
const supportOrders = await q(`select id from public.orders`);
assert('support can read orders', supportOrders.length >= 3);
const supportWrite = await q(`update public.payment_methods set display_order = 99 where asset_code = 'USDT' returning id`);
assert('support update touches 0 rows (RLS USING filter)', supportWrite.length === 0);
const usdtAfter = await one(`select display_order from public.payment_methods where asset_code = 'USDT'`);
assert('support write did not persist', usdtAfter.display_order === 1);

await asRole('anon');
await expectError('anon cannot read coupons', async () => { await q(`select * from public.coupons`); }, 'denied');
await expectError('anon cannot read profiles', async () => { await q(`select * from public.profiles`); }, 'denied');
await expectError('anon cannot read inventory', async () => { await q(`select * from public.digital_inventory`); }, 'denied');

await asRole('authenticated', ALICE);
await expectError('customer cannot run metrics RPC', async () => { await q(`select public.admin_dashboard_metrics()`); }, 'not authorized');
await expectError('customer cannot list outbox', async () => { await q(`select * from public.admin_list_email_outbox(10)`); }, 'not authorized');

await asRole('authenticated', ADMIN);
await expectError('plain admin cannot change roles', async () => {
  await q(`select public.admin_set_user_role($1, 'support')`, [BOB]);
}, 'not authorized');
await asSuperuser();
await q(`update public.profiles set role = 'super_admin' where id = $1`, [ADMIN]);
await asRole('authenticated', ADMIN);
await q(`select public.admin_set_user_role($1, 'support')`, [BOB]);
const bobRole = await one(`select role from public.profiles where id = $1`, [BOB]);
assert('super_admin changed customer role', bobRole.role === 'support');
await expectError('self role change refused', async () => {
  await q(`select public.admin_set_user_role($1, 'customer')`, [ADMIN]);
}, 'own role');

// ---------------------------------------------------------------------------
// 14. Admin RPCs, void flow, settings.
// ---------------------------------------------------------------------------
section('admin RPCs and settings');
const metrics = await one(`select public.admin_dashboard_metrics() as m`);
assert('metrics count real orders', metrics.m.orders.total >= 4, JSON.stringify(metrics.m.orders));
assert('metrics revenue counts verified USD only (69)',
  Number(metrics.m.revenue.USD) === 69, JSON.stringify(metrics.m.revenue));
const analytics = await one(`select public.admin_sales_analytics(30) as a`);
assert('analytics window honored', analytics.a.window_days === 30);
const inv = await one(`select public.admin_inventory_summary() as s`);
const d1 = inv.s.digital.find((r) => r.price_id === price1.id);
assert('inventory summary counts assigned/available (2/1)',
  d1?.assigned === 2 && d1?.available === 1, JSON.stringify(inv.s.digital));
const outboxRows = await q(`select * from public.admin_list_email_outbox(10)`);
assert('admin outbox list shows enriched row',
  outboxRows.length === 1 && outboxRows[0].order_number === created.o.order_number);
const templates = await q(`select key from public.email_templates`);
assert('order_fulfilled template seeded', templates.some((t) => t.key === 'order_fulfilled'));
const auditRows = await q(`select count(*) as n from public.admin_audit_log`);
assert('audit log captured privileged writes', Number(auditRows[0].n) > 10, `got ${auditRows[0].n}`);

const availItem = await one(`select id from public.digital_inventory where status = 'available' limit 1`);
await q(`select public.admin_void_inventory_item($1, 'damaged code in test')`, [availItem.id]);
const voided = await one(`select status from public.digital_inventory where id = $1`, [availItem.id]);
assert('inventory item voided', voided.status === 'void');

await expectError('terminal session cannot be marked under review', async () => {
  await q(`select public.admin_set_payment_review_state($1, 'under_review')`, [sess2.id]);
}, 'live payment session');

await asRole('anon');
const legal = await q(`select key, value from public.store_settings where key like 'legal.%' or key like 'store.support%'`);
assert('legal/support settings publicly readable (5 keys)', legal.length === 5, `got ${legal.length}`);
assert('settings ship unconfigured (empty)', legal.every((r) => r.value === ''));

// ---------------------------------------------------------------------------
// Summary.
// ---------------------------------------------------------------------------
section('summary');
console.log(`\n${passed} passed, ${failed} failed.`);
if (failed > 0) {
  console.log(`failures: ${failures.join('; ')}`);
  process.exit(1);
}
console.log('ALL TESTS PASSED');