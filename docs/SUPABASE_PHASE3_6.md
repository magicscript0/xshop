# XSHOP Supabase storefront phases 3–6

Phase 2 is reported by the owner as already applied. This workspace has no project credentials, Supabase CLI, PostgreSQL client, Docker, or Dashboard connection to independently verify the hosted state. **Do not reapply Phase 2.** The following additive migrations are in dependency order:

1. `supabase/migrations/20260924000100_phase3_catalog.sql`
2. `supabase/migrations/20260924000200_phase4_customer_experience.sql`
3. `supabase/migrations/20260924000300_phase5_crypto_payments.sql`
4. `supabase/migrations/20260924000400_phase6_digital_fulfillment.sql`

These Phase 3–6 migrations have not been applied or live-tested from this workspace. Review them and apply them to the intended Supabase project using the project's normal reviewed migration workflow. Do not apply them to production without the owner's approval. The application uses Supabase as XSHOP's source of truth; the legacy Express/Neon/Clerk/AI services remain isolated to GenAxis routes.

## Browser configuration

Copy `client/.env.example` to a local environment file and set:

- `VITE_SUPABASE_URL` — the intended Supabase project URL.
- `VITE_SUPABASE_PUBLISHABLE_KEY` — that project's publishable/anon browser key.

These values are public browser configuration. Never add a Supabase `service_role` key, payment-provider secret, wallet signing key, SMTP credential, or private customer data to a `VITE_` variable, client source, or Git. See `docs/SUPABASE_PHASE2.md` for Auth redirect/provider setup and the legacy Clerk boundary.

## Phase 3 — catalog

The public catalog is database-backed through the `search_catalog` RPC and `catalog_current_offers` view. The storefront supports search, category, product-type, currency and price filters, availability, active deals, sorting, and paging. Product media references the public `product-media` bucket. Catalog records are not seeded by these migrations; a listing is public only when active, public, rights-verified, and otherwise eligible under RLS.

Catalog administration is not a full UI in this phase. Trusted database operators remain responsible for the rights review and publishing workflow.

## Phase 4 — customer experience

Customers use authenticated RPCs for persistent cart changes, order creation, wishlist changes, and notification reads. `create_order_from_cart` calculates prices inside Supabase, enforces one currency per order, stores order-item snapshots, clears the purchased cart, and requires a client-generated idempotency UUID. The browser does not submit an order total. Orders, item snapshots, cart rows, notifications, and fulfillment records are protected by RLS and/or owner-checking RPCs.

## Phase 5 — configurable crypto payments

Supported assets and networks are constrained in the database: USDT on TRC20/ERC20, USDC on ERC20, BTC on Bitcoin, ETH on Ethereum, TRX on TRON, and LTC on Litecoin. No payment method, wallet address, exchange rate, or credential is seeded. A trusted operator must configure `public.payment_methods` for the correct fiat currency, asset/network, amount precision, conversion rate, active window, and receiving address before customers see it. Active receiving addresses are intentionally visible to customers so they can pay; private signing credentials must never be stored in that table.

`create_payment_session` snapshots the configured details and quotes a 60-minute session using the database clock. The customer can submit a transaction hash, but that only records a reference. Only a trusted `admin`/`super_admin` invoking `verify_payment_session` can approve/reject a submitted transaction; approval must follow real verification on the correct network. Rejections require an auditable reason. No chain API, payment gateway, auto-verifier, or admin dashboard is included.

Pending sessions/reservations are expired using Supabase server time when the customer calls the expiry RPC or starts another payment session. There is no scheduled worker/cron configured in this repository. Submitted sessions remain reserved for manual review rather than being released just because their original 60-minute window passed.

## Phase 6 — digital fulfillment

`public.digital_inventory` is private by default. An authorized role can import real delivery records using the idempotent `admin_import_digital_inventory` RPC and a stable batch UUID. Import only legitimate products with documented resale rights. Do not place real keys/codes in Git, browser configuration, public Storage, or support logs.

Inventory reservation uses row locks and `SKIP LOCKED`; a reservation is released on session expiry/rejection. `private.fulfill_verified_order` only assigns reserved inventory after the order is recorded as verified. Manual fulfillment requires the admin-only `fulfillment_manual_complete` RPC. Unique constraints and status checks prevent the same inventory item from being delivered twice. Customers can read only their own assigned items. No delivery record is seeded, and no email is sent from the browser.

A private `fulfillment_email_outbox` row is created only after successful fulfillment. The service role can read and update its send status, but this repository does not include or claim an email sender/worker; configure one separately before promising email delivery.

## Storefront routes

- Public database catalog: `/`, `/shop`, `/search`, `/categories`, `/categories/:slug`, `/deals`, and `/products/:slug`.
- Authenticated cart/order flow: `/cart`, `/checkout`, `/account/*`.
- Payment instructions are shown only for active configured methods and are stored as order-session snapshots.
- A transaction hash is visibly described as unverified until an authorized manual review records payment verification.
- Digital delivery is shown only for account-owned fulfillment after successful database assignment.
- `/admin/*` remains a placeholder; there is no full administrative dashboard.

If Supabase configuration is absent, the storefront renders clear unavailable/empty states. It does not fabricate products, prices, payment methods, addresses, verification, fulfillment, or email.
