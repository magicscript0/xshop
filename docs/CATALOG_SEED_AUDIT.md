# XSHOP Catalog Seed Audit (Read-Only)

Date: 2026-09-25 · Branch: `arena/01a0d586-xshop` · Scope: Phase 3 catalog schema → RPC → services → `/shop` rendering.
**No files, migrations, database objects, or production data were modified during this audit** (this report file is the only addition).

---

## A. LIVE DATABASE FACT

- Confirmed input: `public.products` contains **0 rows total, 0 active** on the live database.
- **What this proves:** the live catalog is empty — `/shop`, `/deals`, `/search`, `/categories/:slug`, and the home catalog strip will all render their accurate empty states, and nothing can be added to a cart. This is expected: no migration in the repo seeds any product, category, variant, price, deal, or media row (verified — the only `INSERT` statements in migrations touch profiles, storage buckets, store settings, and transactional tables).
- **What it does NOT prove:** it does not indicate a schema, RLS, or code problem. The full chain (schema → `search_catalog` → `catalogService` → `/shop`) is consistent; it simply has no data. It also does not prove `categories`, `payment_methods`, or admin roles are populated/configured — those were not part of the query.

## B. CURRENT CATALOG SCHEMA

All from `supabase/migrations/20260924000100_phase3_catalog.sql` (availability logic later refined by phase 6).

### `public.categories`
| Column | Required | Default | Constraint |
|---|---|---|---|
| `id` uuid PK | auto | `gen_random_uuid()` | |
| `name` | **yes** | | 1–120 chars trimmed |
| `slug` | **yes** | | UNIQUE, `^[a-z0-9]+(-[a-z0-9]+)*$` |
| `description` | no | null | ≤ 2000 chars |
| `status` | | `'draft'` | `draft\|active\|archived` |
| `visibility` | | `'private'` | `public\|unlisted\|private` |
| `sort_order` | | `0` | |

⚠️ Defaults are **draft/private** — a category inserted with defaults is invisible.

### `public.products`
| Column | Required | Default | Constraint |
|---|---|---|---|
| `id` uuid PK | auto | `gen_random_uuid()` | |
| `slug` | **yes** | | UNIQUE, same slug regex |
| `name` | **yes** | | 1–180 chars |
| `short_description` / `description` | no | null | ≤ 500 / ≤ 12000 |
| `product_type` | **yes** | | `digital_code\|gift_card\|voucher\|software_license\|other_digital` |
| `currency_code` | **yes** | | `^[A-Z]{3}$` |
| `status` | | `'draft'` | `draft\|active\|archived` |
| `visibility` | | `'private'` | `public\|unlisted\|private` |
| `resale_rights_verified` | | `false` | table CHECK: if true, `resale_rights_verified_by` (FK → `auth.users`) **and** `resale_rights_verified_at` must both be set |
| `sort_order` | | `0` | |

### `public.product_variants`
- `product_id` FK → products (RESTRICT), `variant_name` (1–120), `sku` UNIQUE nullable (≤100), `denomination_value numeric(18,6)` nullable `> 0`, `status` default `'draft'` (`draft|active|archived`), `sort_order`. Composite `UNIQUE (id, product_id)` supports the price/media/deal FKs.

### `public.product_prices`
- `product_id` FK, `variant_id` nullable with composite FK `(variant_id, product_id)` → variants.
- **`amount numeric(14,2) NOT NULL CHECK (amount > 0)`**.
- `availability_mode` default `'digital'`: `unlimited | tracked | digital`.
- `stock_on_hand`: CHECK — **required ≥ 0 iff `tracked`**, must be NULL otherwise.
- `fulfillment_mode` default `'inventory'`: CHECK — **`digital` ⇒ `inventory`; `unlimited`/`tracked` ⇒ `manual`**. No other combination is insertable.
- Partial unique indexes: **exactly one** unvarianted price per product (`variant_id IS NULL`), and **one price per (product, variant)** pair.

### `public.product_categories`
- Pure join table, PK `(product_id, category_id)`; category delete RESTRICTed.

### `public.product_media`
- `bucket_id` fixed to `'product-media'` (CHECK), `object_path` non-empty with path-traversal guard, `alt_text` ≤ 300, `UNIQUE (bucket_id, object_path)`; optional `variant_id` composite FK.

### `public.product_deals` (optional)
- `percent` (≤100, `currency_code` NULL) or `amount` (requires ISO `currency_code` matching product currency to actually apply), `status` default `'draft'` (`draft|active|inactive`), optional window, `priority`.

### RLS / grants (all 7 tables)
- Public/anon SELECT only through visibility policies (products additionally require `resale_rights_verified`).
- All writes require `private.user_has_any_role(['admin','super_admin'])`. `anon` has **no** write grants.
- Phase 7 adds `private.audit_row_change()` AFTER-triggers on all catalog tables — inserts are audited (actor `system` when done from the SQL editor).

### Price representation (item 11 — exact)
**`numeric(14,2)` in major currency units** (e.g. `9.99`), constrained `> 0`. **Not** integer minor units. Deal values are `numeric(14,4)`; denominations `numeric(18,6)`; cart/order amounts `numeric(14,2)`. Crypto minor units appear only in payment sessions, never in the catalog.

## C. PRODUCT VISIBILITY REQUIREMENTS (/shop)

`/shop` → `CatalogBrowser` → `catalogService.search()` → RPC `search_catalog` (security **invoker**, so RLS applies to anon). A product appears **iff ALL** of:

1. `products.status = 'active'`
2. `products.visibility = 'public'`
3. `products.resale_rights_verified = true` (⇒ `verified_by` + `verified_at` set, `verified_by` a real `auth.users` id)
4. **At least one row in `catalog_current_offers`** — `search_catalog` INNER-JOINs its rollup on this view, so a product **with no `product_prices` row never appears**, even when 1–3 hold. Concretely:
   - product with **no variants** → exactly one price row with `variant_id IS NULL`; or
   - product **with variants** → price rows joined to variants whose `status = 'active'` (an unvarianted price row is **excluded** the moment any variant exists; draft variants don't count).

**Not required for visibility:** media (optional — `ProductCard` falls back to a Lucide `Package` placeholder), categories (optional — only needed for category filtering/`/categories/:slug`), deals, inventory, availability (`is_available=false` products still list; the "Available only" filter then hides them).

## D. PURCHASABLE PRODUCT REQUIREMENTS

Exact chain actually enforced by the current code:

| Step | Required? | Enforced by |
|---|---|---|
| Category (`active` + `public`) | Optional for purchase; needed only for category browsing | `search_catalog` category joins |
| Product (`active` + `public` + verified trio) | **Required** | RLS + view WHERE |
| Variant (`active`) | Only if the product has variants | view WHERE |
| Price row (`amount > 0`, valid mode combo) | **Required** (see C.4) | view join + CHECKs |
| Availability = true | **Required to add to cart** | `cart_add_item` re-reads `catalog_current_offers` and raises if `NOT is_available`; `tracked` also re-checks `stock_on_hand ≥ cart quantity` |
| Checkout | Same availability re-checked in `create_order_from_cart`; single currency per cart | phase 4/8 RPCs |
| Fulfillment | `digital` → needs `digital_inventory` rows with `status='available'` imported via `admin_import_digital_inventory` RPC (**only** path — direct table writes are revoked); `unlimited`/`tracked` → order lands in `manual_required`, completed via `fulfillment_manual_complete` | phase 6 |

Availability per mode (phase 6 definition of `catalog_option_available`):
- `unlimited` → always available
- `tracked` → `stock_on_hand > 0`
- `digital` → ≥ 1 `digital_inventory` row `available` (or a reclaimable expired reservation)

So: a **`unlimited`/manual** product is fully purchasable with just product + price rows. A **`digital`** product additionally needs inventory codes imported before it shows as available or can be carted.

## E. EXISTING SEED DATA

**None exists.** Searched the whole repo for seed/fixture/demo/sample/bootstrap files, `supabase/seed.sql`, migration INSERTs, and hardcoded product constants:
- No `seed.sql`, no fixtures, no catalog INSERTs in any migration, no product constants in the client (`ProductGrid.jsx` only has a `products = []` default prop; all data flows from `search_catalog`).
- Only near-matches are unrelated: `client/public/demo.mp4` and `client/src/pages/product/Demo.jsx` (legacy GenAxis marketing assets), and `.git/hooks/*.sample`.
- `supabase/config.toml` has no seed configuration.

There is therefore **nothing to assess for compatibility** — any seed must be written fresh against the schema in section B.

## F. ADMIN FLOW

Both paths exist and are schema-safe:

1. **Admin UI (recommended for real operations)** — `/admin/categories` and `/admin/products` (ProductEditor) already create categories, products (incl. the resale-verification trio, auto-filled with the acting admin + timestamp), variants, prices (mode combos enforced in UI), deals, media uploads, category links; `/admin/inventory` imports digital codes via the RPC. Everything goes through RLS as the admin user and is fully audited with a real actor id. **Precondition:** at least one profile promoted to `admin`/`super_admin` (first promotion must be done in SQL since `admin_set_user_role` requires an existing super_admin).
2. **Controlled SQL seed script** — viable for initial bulk load, run in the Supabase SQL editor (runs as `postgres`, bypassing RLS legitimately). Constraints that still bind: the slug regexes, mode/stock CHECKs, the one-price-per-option partial indexes, and `resale_rights_verified_by` must be a **real `auth.users` id**. Audit rows record actor `system`. Digital codes must **still** go through `admin_import_digital_inventory` (or be omitted from the seed), never direct `digital_inventory` inserts.

## G. RECOMMENDED NEXT IMPLEMENTATION

**One step:** create a single idempotent seed script `supabase/seed/catalog_seed.sql` (kept **out of** `supabase/migrations/` so schema history stays clean), to be run manually in the SQL editor after you supply (a) the admin user's UUID for `resale_rights_verified_by` and (b) the real, authorized product list. Exact insertion order the script must follow:

1. `categories` — explicit `status='active'`, `visibility='public'` (defaults hide them).
2. `products` — explicit `status='active'`, `visibility='public'`, `resale_rights_verified=true`, `resale_rights_verified_by=<real admin auth.users.id>`, `resale_rights_verified_at=now()`.
3. `product_variants` — only for multi-denomination products; `status='active'`.
4. `product_prices` — one row per sellable option; valid combos only: `('digital','inventory')`, `('unlimited','manual', stock NULL)`, `('tracked','manual', stock ≥ 0)`.
5. `product_categories` links.
6. `product_media` (optional) — only after real images are uploaded to the `product-media` bucket; rows must reference existing `object_path`s.
7. `product_deals` (optional).
8. Digital inventory — **not in the SQL seed**; import real codes afterwards via `/admin/inventory` (or the `admin_import_digital_inventory` RPC as an admin).

**Safety (item 13):** any card-brand-themed items (e.g. "Visa gift card") must be represented strictly as lawful digital voucher *products* — name, description, denomination, price only. No card numbers, CVVs, credentials, or account data anywhere; delivery payloads only ever enter via the authorized inventory-import RPC when you provide legitimately sourced codes. Nothing in this plan fabricates such data.

Not generated yet, per instructions — awaiting your product list and approval.

## H. FILES INSPECTED

- `supabase/migrations/20260924000100_phase3_catalog.sql` (complete, all 471 lines)
- `supabase/migrations/20260924000000_phase2_xshop_foundation.sql` (buckets, roles, profiles)
- `supabase/migrations/20260924000200_phase4_customer_experience.sql` (`cart_add_item`, `get_my_cart`, order creation)
- `supabase/migrations/20260924000400_phase6_digital_fulfillment.sql` (`catalog_option_available` v2, inventory import/reservation)
- `supabase/migrations/20260924001000_phase7_admin_operations.sql` (audit triggers, grants)
- `supabase/migrations/20260924001100_phase8_growth.sql` (order-creation replacement — same catalog reads)
- `client/src/services/catalogService.js`, `client/src/services/cartService.js`
- `client/src/pages/store/Shop.jsx`, `Search.jsx`, `Deals.jsx`, `Categories.jsx`, `CategoryDetails.jsx`, `ProductDetails.jsx`
- `client/src/components/store/CatalogBrowser.jsx`, `ProductGrid.jsx`, `ProductCard.jsx`
- `client/src/services/adminService.js`; `client/src/components/admin/ProductEditor.jsx`; `client/src/pages/admin/AdminProducts.jsx`, `AdminCategories.jsx`, `AdminInventory.jsx`
- `supabase/config.toml`; repo-wide searches for seed/fixture/demo/INSERT data

## I. NO-CHANGE CONFIRMATION

No production code, migrations, database schema/objects, auth, payment, fulfillment, RLS, security settings, or live data were modified. The only artifact produced is this report (`docs/CATALOG_SEED_AUDIT.md`), committed to `arena/01a0d586-xshop`.
