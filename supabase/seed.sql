-- XSHOP starter catalog seed (DEMO DATA - replace with authorized supplier records).
--
-- Applies AFTER all migrations (supabase/migrations/*.sql). Run once per
-- database; every statement is idempotent (ON CONFLICT DO NOTHING / NOT EXISTS
-- guards), so re-running is safe.
--
-- PREREQUISITE: at least one profile with role admin/super_admin must exist.
-- That admin is recorded as the resale-rights verifier for these starter rows.
-- The seed aborts with a clear error when no admin exists.
--
-- WHAT THIS SEEDS (and nothing else):
--   6 categories, 30 products, ~102 variants, ~102 prices, 8 active deals.
-- WHAT THIS NEVER SEEDS:
--   users, orders, payments, transaction hashes, reviews, wishlists, or
--   digital_inventory rows. Products that need pre-loaded codes use
--   availability_mode='digital' and therefore report accurately as
--   unavailable until the owner imports real codes via
--   public.admin_import_digital_inventory. Everything else uses
--   availability_mode='unlimited' + fulfillment_mode='manual' (staff deliver
--   after payment verification through fulfillment_manual_complete).
-- NO product media rows are seeded (no image binaries in Git). The storefront
-- renders its neutral placeholder for products without media.
--
-- Hosted apply: paste this file into the Supabase SQL editor AFTER applying
-- migrations through Phase 9 (see docs/SUPABASE_SEED_CATALOG.md).

begin;

-- Re-runnable staging area (plain temp tables: visible across statements in
-- this session, dropped automatically at session end).
drop table if exists seed_ctx;
drop table if exists seed_categories;
drop table if exists seed_products;
drop table if exists seed_variants;
drop table if exists seed_prices;
drop table if exists seed_product_categories;
drop table if exists seed_deals;

create temp table seed_ctx (verifier_id uuid not null);

do $$
declare verifier uuid;
begin
  select profile.id into verifier
  from public.profiles as profile
  where profile.role in ('admin', 'super_admin')
  order by profile.created_at asc
  limit 1;
  if verifier is null then
    raise exception 'SEED PREREQUISITE: promote at least one admin profile before seeding the catalog (update public.profiles set role = % where id = ...).', 'super_admin'
      using errcode = 'P0001';
  end if;
  insert into seed_ctx (verifier_id) values (verifier);
end $$;

create temp table seed_categories (
  slug text primary key,
  name text not null,
  description text not null,
  sort_order integer not null
);

insert into seed_categories (slug, name, description, sort_order) values
  ('digital-gift-cards', 'Digital Gift Cards', 'Stored-value gift cards from major brands, delivered as digital codes after payment verification.', 10),
  ('digital-vouchers', 'Digital Vouchers', 'Multi-partner vouchers for entertainment, shopping, gaming, and wellness.', 20),
  ('software-licenses', 'Software Licenses', 'Genuine license keys for productivity, security, creative, and developer software.', 30),
  ('ai-saas-credits', 'AI / SaaS Credits', 'Prepaid credits for AI APIs and software platforms. Top up without a subscription.', 40),
  ('gaming-credits', 'Gaming Credits', 'Wallet top-ups and in-game currency cards for major gaming platforms.', 50),
  ('digital-subscriptions', 'Digital Subscriptions', 'Streaming, productivity, gaming, and AI subscriptions activated by code.', 60);

insert into public.categories (name, slug, description, status, visibility, sort_order)
select name, slug, description, 'active', 'public', sort_order
from seed_categories
on conflict (slug) do nothing;

create temp table seed_products (
  slug text primary key,
  name text not null,
  short_description text not null,
  description text not null,
  product_type text not null,
  provider_name text not null,
  featured boolean not null,
  terms text not null,
  redemption_instructions text not null,
  region_restrictions text,
  delivery_method text not null,
  delivery_eta text not null,
  low_stock_threshold integer,
  sort_order integer not null,
  created_days_ago integer not null
);

insert into seed_products
  (slug, name, short_description, description, product_type, provider_name, featured,
   terms, redemption_instructions, region_restrictions, delivery_method, delivery_eta,
   low_stock_threshold, sort_order, created_days_ago)
values
  ('amazon-gift-card', 'Amazon Gift Card', 'Stored-value Amazon gift card delivered as a digital claim code.',
   'Add funds to an Amazon account balance for shopping across eligible departments. The claim code arrives by email after payment verification and never expires once redeemed to an account.',
   'gift_card', 'Amazon', false,
   'Digital claim code delivered after payment verification. Codes are non-refundable once delivered. Redemption and use are subject to the provider account terms.',
   'Sign in to your Amazon account, open Account, choose Gift cards, select Redeem, and enter the claim code.',
   'Redemption requires a United States-region provider account.', 'Email delivery', 'Within 6 hours of payment verification', null, 10, 12),
  ('apple-gift-card', 'Apple Gift Card', 'Stored-value Apple gift card for apps, media, and hardware.',
   'Use one balance across the App Store, iTunes Store, Apple subscriptions, and Apple retail. The digital code arrives by email after payment verification.',
   'gift_card', 'Apple', false,
   'Digital code delivered after payment verification. Codes are non-refundable once delivered. Redemption and use are subject to the provider account terms.',
   'Open the App Store, tap your profile, choose Redeem Gift Card or Code, and enter the code.',
   'Redemption requires a United States-region provider account.', 'Email delivery', 'Within 6 hours of payment verification', null, 20, 9),
  ('google-play-gift-card', 'Google Play Gift Card', 'Stored-value Google Play credit for apps, games, and media.',
   'Top up a Google Play balance for apps, games, movies, and in-app purchases. The digital code arrives by email after payment verification.',
   'gift_card', 'Google', false,
   'Digital code delivered after payment verification. Codes are non-refundable once delivered. Redemption and use are subject to the provider account terms.',
   'Open Google Play, tap your profile, choose Payments and subscriptions, select Redeem code, and enter the code.',
   'Redemption requires a United States-region provider account.', 'Email delivery', 'Within 6 hours of payment verification', null, 30, 15),
  ('playstation-store-gift-card', 'PlayStation Store Gift Card', 'Stored-value PlayStation Store credit for games and add-ons.',
   'Fund a PlayStation wallet for games, expansions, and subscriptions on console and web stores. The 12-digit code arrives by email after payment verification.',
   'gift_card', 'PlayStation', true,
   'Digital code delivered after payment verification. Codes are non-refundable once delivered. Redemption and use are subject to the provider account terms.',
   'Sign in to PlayStation Store, open your profile, choose Redeem Codes, and enter the 12-digit code.',
   'Redemption requires a United States-region provider account.', 'Email delivery', 'Within 6 hours of payment verification', null, 40, 6),
  ('xbox-gift-card', 'Xbox Gift Card', 'Stored-value Xbox credit for games, add-ons, and subscriptions.',
   'Add funds to a Microsoft account for Xbox consoles, PC games, and entertainment apps. The 25-character code arrives by email after payment verification.',
   'gift_card', 'Xbox', false,
   'Digital code delivered after payment verification. Codes are non-refundable once delivered. Redemption and use are subject to the provider account terms.',
   'Sign in to your Microsoft account, open the Microsoft Store, choose Redeem code, and enter the 25-character code.',
   'Redemption requires a United States-region provider account.', 'Email delivery', 'Within 6 hours of payment verification', null, 50, 11),
  ('steam-gift-card', 'Steam Gift Card', 'Stored-value Steam Wallet credit for games and software.',
   'Top up a Steam Wallet for thousands of PC games, software, and hardware. The wallet code arrives by email after payment verification.',
   'gift_card', 'Steam', true,
   'Digital code delivered after payment verification. Codes are non-refundable once delivered. Redemption and use are subject to the provider account terms.',
   'Sign in to Steam, open Account details, choose to add funds with a Steam Wallet Code, and enter the code.',
   'Redemption requires a United States-region provider account.', 'Email delivery', 'Within 6 hours of payment verification', null, 60, 4),
  ('entertainment-voucher', 'Spotlight Entertainment Voucher', 'Voucher credit for movies, events, and streaming partners.',
   'Spendable with participating Spotlight entertainment partners for tickets and streaming. The voucher code arrives by email after payment verification.',
   'voucher', 'Spotlight', false,
   'Digital voucher code delivered after payment verification. Vouchers are non-refundable once delivered. Partner acceptance varies by region.',
   'Visit the Spotlight partner portal linked in your delivery email and enter the voucher code at checkout.',
   'Valid with United States partner locations only.', 'Email delivery', 'Within 6 hours of payment verification', null, 70, 14),
  ('shopping-voucher', 'Choice Shopping Voucher', 'Multi-store shopping voucher accepted by partner retailers.',
   'One voucher balance usable across the Choice Rewards partner network, online and in store. The voucher code arrives by email after payment verification.',
   'voucher', 'Choice Rewards', false,
   'Digital voucher code delivered after payment verification. Vouchers are non-refundable once delivered. Partner acceptance varies by region.',
   'Enter the voucher code in the payment step at any participating Choice Rewards partner store.',
   null, 'Email delivery', 'Within 6 hours of payment verification', null, 80, 7),
  ('gaming-voucher', 'ArcadePlay Gaming Voucher', 'Voucher credit for the ArcadePlay games catalog.',
   'Credit for game purchases, season passes, and cosmetics inside ArcadePlay. The voucher code arrives by email after payment verification.',
   'voucher', 'ArcadePlay', false,
   'Digital voucher code delivered after payment verification. Vouchers are non-refundable once delivered. Redemption is subject to the ArcadePlay account terms.',
   'Sign in to your ArcadePlay account, open Wallet, choose Redeem voucher, and enter the code.',
   'Redemption requires a United States-region ArcadePlay account.', 'Email delivery', 'Within 6 hours of payment verification', null, 90, 13),
  ('wellness-voucher', 'Serene Wellness Voucher', 'Voucher credit for spa, fitness, and wellness partners.',
   'Book spa visits, classes, and treatments with participating Serene partners. The voucher code arrives by email after payment verification.',
   'voucher', 'Serene', false,
   'Digital voucher code delivered after payment verification. Vouchers are non-refundable once delivered. Partner acceptance varies by region.',
   'Present the voucher code when booking with a participating Serene partner, or enter it online.',
   'Valid with United States partner locations only.', 'Email delivery', 'Within 6 hours of payment verification', null, 100, 16),
  ('officesuite-pro-1-year', 'OfficeSuite Pro 1-Year License', 'One year of OfficeSuite Pro for documents and spreadsheets.',
   'Genuine OfficeSuite Pro license with desktop and mobile apps plus cloud storage. The license key arrives by email after payment verification.',
   'software_license', 'OfficeSuite', false,
   'License key delivered after payment verification. Keys are non-refundable once issued. Activation is subject to the publisher license agreement.',
   'Download OfficeSuite, open activation, and enter the license key when prompted.',
   'Keys activate on United States-region accounts.', 'Email delivery', 'Within 6 hours of payment verification', null, 110, 10),
  ('secureshield-antivirus-1-year', 'SecureShield Antivirus 1-Year', 'One year of SecureShield protection against malware.',
   'Real-time antivirus with web protection and ransomware shield for home devices. The license key arrives by email after payment verification.',
   'software_license', 'SecureShield', false,
   'License key delivered after payment verification. Keys are non-refundable once issued. Activation is subject to the publisher license agreement.',
   'Install SecureShield, open activation, and enter the license key to enable protection.',
   null, 'Email delivery', 'Within 6 hours of payment verification', null, 120, 8),
  ('pixelforge-creative-annual', 'PixelForge Creative Annual', 'Annual PixelForge plan for photo and design work.',
   'Professional photo editing, vector design, and cloud libraries for individuals and teams. The license key arrives by email after payment verification.',
   'software_license', 'PixelForge', true,
   'License key delivered after payment verification. Keys are non-refundable once issued. Activation is subject to the publisher license agreement.',
   'Install PixelForge, sign in, and enter the license key in the activation dialog.',
   'Keys activate on United States-region accounts.', 'Email delivery', 'Within 6 hours of payment verification', null, 130, 5),
  ('devtools-pro-ide-annual', 'DevTools Pro IDE Annual', 'Annual IDE license for professional developers.',
   'Full-featured IDE with debugging, profiling, and team collaboration for individuals and teams. The license key arrives by email after payment verification.',
   'software_license', 'DevTools', false,
   'License key delivered after payment verification. Keys are non-refundable once issued. Activation is subject to the publisher license agreement.',
   'Install the IDE, open license management, and enter the key to activate your seat.',
   'Keys activate on United States-region accounts.', 'Email delivery', 'Within 6 hours of payment verification', null, 140, 18),
  ('vaultpass-manager-1-year', 'VaultPass Manager 1-Year', 'One year of VaultPass premium password management.',
   'Encrypted vault with family sharing, security reports, and priority support. The license key arrives by email after payment verification.',
   'software_license', 'VaultPass', false,
   'License key delivered after payment verification. Keys are non-refundable once issued. Activation is subject to the publisher license agreement.',
   'Install VaultPass, create or open your vault, and enter the key to unlock premium.',
   null, 'Email delivery', 'Within 6 hours of payment verification', null, 150, 20),
  ('novaai-api-credits', 'NovaAI API Credits', 'Prepaid NovaAI API credits with no subscription required.',
   'Pay-as-you-go credits for NovaAI language and embedding APIs at posted rates. The credit code arrives by email after payment verification.',
   'digital_code', 'NovaAI', true,
   'Credit code delivered after payment verification. Codes are non-refundable once delivered. Credits apply to posted API rates.',
   'Open your NovaAI console, go to Billing, choose Add credits, and enter the credit code.',
   'Credits apply to United States-region NovaAI organizations.', 'Email delivery', 'Within 6 hours of payment verification', null, 160, 3),
  ('pixelmind-image-credits', 'PixelMind Image Credits', 'Prepaid credits for PixelMind AI image generation.',
   'Generate images with commercial-use rights on posted per-image rates. The credit code arrives by email after payment verification.',
   'digital_code', 'PixelMind', false,
   'Credit code delivered after payment verification. Codes are non-refundable once delivered. Credits apply to posted generation rates.',
   'Open PixelMind, go to Credits, choose Redeem, and enter the credit code.',
   'Credits apply to United States-region PixelMind accounts.', 'Email delivery', 'Within 6 hours of payment verification', null, 170, 17),
  ('clouddocs-workspace-credits', 'CloudDocs Workspace Credits', 'Prepaid credits for CloudDocs storage and seats.',
   'Cover extra storage, seats, and workflow runs without changing plans. The credit code arrives by email after payment verification.',
   'digital_code', 'CloudDocs', false,
   'Credit code delivered after payment verification. Codes are non-refundable once delivered. Credits apply to posted workspace rates.',
   'Open CloudDocs settings, choose Workspace billing, and apply the credit code.',
   'Credits apply to United States-region CloudDocs workspaces.', 'Email delivery', 'Within 6 hours of payment verification', null, 180, 19),
  ('meetflow-pro-credits', 'MeetFlow Pro Credits', 'Prepaid credits for MeetFlow meetings and recording.',
   'Fund large meetings, cloud recording, and transcription minutes. The credit code arrives by email after payment verification.',
   'digital_code', 'MeetFlow', false,
   'Credit code delivered after payment verification. Codes are non-refundable once delivered. Credits apply to posted usage rates.',
   'Open MeetFlow billing settings and enter the credit code to top up your workspace.',
   'Credits apply to United States-region MeetFlow workspaces.', 'Email delivery', 'Within 6 hours of payment verification', null, 190, 21),
  ('dataquery-scale-credits', 'DataQuery Scale Credits', 'Prepaid DataQuery credits up to enterprise scale.',
   'Standard packs are provisioned by staff after verification. Enterprise packs are delivered from imported key inventory once the owner stocks it.',
   'digital_code', 'DataQuery', false,
   'Credit provisioning follows payment verification. Provisioned credits are non-refundable. Enterprise packs require stocked key inventory.',
   'Open the DataQuery console billing page and apply the Scale credit code to your organization.',
   'Credits apply to United States-region DataQuery organizations.', 'Digital code delivery', 'Within minutes of payment verification', 5, 200, 2),
  ('nintendo-eshop-card', 'Nintendo eShop Card', 'Stored-value Nintendo eShop credit for games and DLC.',
   'Fund a Nintendo eShop balance for Switch games, DLC, and memberships. Stock is imported by the owner; this listing is unavailable until then.',
   'gift_card', 'Nintendo', false,
   'Digital code delivered from stocked inventory after payment verification. Codes are non-refundable once delivered. Redemption is subject to the provider account terms.',
   'Open Nintendo eShop, select Enter Code, and enter the 16-digit download code.',
   'Redemption requires a United States-region provider account.', 'Digital code delivery', 'Within minutes of payment verification', 5, 210, 22),
  ('fortnite-vbucks-card', 'Fortnite V-Bucks Card', 'V-Bucks credit for Fortnite cosmetics and passes.',
   'Redeemable V-Bucks value for outfits, emotes, and Battle Pass tiers. The card code arrives by email after payment verification.',
   'gift_card', 'Epic Games', false,
   'Digital code delivered after payment verification. Codes are non-refundable once delivered. Redemption is subject to the provider account terms.',
   'Visit the official V-Bucks redemption page, sign in, and enter the card code.',
   'Redemption requires a United States-region provider account.', 'Email delivery', 'Within 6 hours of payment verification', null, 220, 23),
  ('roblox-credit', 'Roblox Credit', 'Roblox credit for avatar items and experiences.',
   'Spendable Roblox balance for avatar shop items, game passes, and premium payouts. The credit code arrives by email after payment verification.',
   'gift_card', 'Roblox', false,
   'Digital code delivered after payment verification. Codes are non-refundable once delivered. Redemption is subject to the provider account terms.',
   'Sign in to Roblox, open the redemption page, and enter the credit code.',
   'Redemption requires a United States-region provider account.', 'Email delivery', 'Within 6 hours of payment verification', null, 230, 24),
  ('riot-points-card', 'Riot Points Card', 'Riot Points credit for Riot Games titles.',
   'Riot Points for champions, skins, and event passes across Riot titles. Stock is imported by the owner; this listing is unavailable until then.',
   'gift_card', 'Riot Games', false,
   'Digital code delivered from stocked inventory after payment verification. Codes are non-refundable once delivered. Redemption is subject to the provider account terms.',
   'Open the Riot client store, choose Prepaid Cards, and enter the code.',
   'Redemption requires a United States-region Riot account.', 'Digital code delivery', 'Within minutes of payment verification', 5, 240, 25),
  ('blizzard-balance-card', 'Blizzard Balance Card', 'Blizzard Balance for games, services, and shop items.',
   'Stored Blizzard Balance for game time, services, and the in-game shops. Stock is imported by the owner; this listing is unavailable until then.',
   'gift_card', 'Blizzard', false,
   'Digital code delivered from stocked inventory after payment verification. Codes are non-refundable once delivered. Redemption is subject to the provider account terms.',
   'Sign in to your Blizzard account, open Account Settings, choose to add Balance with a code, and enter it.',
   'Redemption requires a United States-region provider account.', 'Digital code delivery', 'Within minutes of payment verification', 5, 250, 26),
  ('streamwave-premium', 'StreamWave Premium', 'StreamWave Premium streaming subscription by duration.',
   'Ad-free 4K streaming with offline downloads and multiple profiles. The activation code arrives by email after payment verification.',
   'other_digital', 'StreamWave', true,
   'Activation code delivered after payment verification. Activated subscriptions are non-refundable. Duration starts when the code is redeemed.',
   'Sign in to StreamWave, open Membership, choose Redeem, and enter the activation code.',
   'Activation requires a United States-region StreamWave account.', 'Email delivery', 'Within 6 hours of payment verification', null, 260, 1),
  ('musicflow-plus', 'MusicFlow Plus', 'MusicFlow Plus music subscription by duration.',
   'Ad-free music with offline mode and high-fidelity audio. The activation code arrives by email after payment verification.',
   'other_digital', 'MusicFlow', false,
   'Activation code delivered after payment verification. Activated subscriptions are non-refundable. Duration starts when the code is redeemed.',
   'Open MusicFlow settings, choose Subscription, and enter the activation code.',
   'Activation requires a United States-region MusicFlow account.', 'Email delivery', 'Within 6 hours of payment verification', null, 270, 27),
  ('cloudvault-2tb', 'CloudVault 2TB', 'CloudVault 2TB storage plan by duration.',
   'Two terabytes of encrypted cloud storage with file history and sharing. The activation code arrives by email after payment verification.',
   'other_digital', 'CloudVault', false,
   'Activation code delivered after payment verification. Activated subscriptions are non-refundable. Duration starts when the code is redeemed.',
   'Open CloudVault settings, choose Plan, and enter the activation code to enable storage.',
   'Activation requires a United States-region CloudVault account.', 'Email delivery', 'Within 6 hours of payment verification', null, 280, 28),
  ('arcadeplay-pass', 'ArcadePlay Pass', 'ArcadePlay Pass gaming subscription by duration.',
   'Unlimited access to the ArcadePlay catalog with member discounts. The activation code arrives by email after payment verification.',
   'other_digital', 'ArcadePlay', false,
   'Activation code delivered after payment verification. Activated subscriptions are non-refundable. Duration starts when the code is redeemed.',
   'Sign in to ArcadePlay, open Pass settings, and enter the activation code.',
   'Activation requires a United States-region ArcadePlay account.', 'Email delivery', 'Within 6 hours of payment verification', null, 290, 29),
  ('novaai-pro-subscription', 'NovaAI Pro Subscription', 'NovaAI Pro monthly or annual subscription.',
   'Priority API throughput, higher limits, and early feature access. The activation code arrives by email after payment verification.',
   'other_digital', 'NovaAI', false,
   'Activation code delivered after payment verification. Activated subscriptions are non-refundable. Duration starts when the code is redeemed.',
   'Open NovaAI settings, choose Subscription, and enter the activation code.',
   'Activation requires a United States-region NovaAI organization.', 'Email delivery', 'Within 6 hours of payment verification', null, 300, 30);

insert into public.products
  (slug, name, short_description, description, product_type, currency_code, status, visibility,
   resale_rights_verified, resale_rights_verified_by, resale_rights_verified_at,
   provider_name, featured, terms, redemption_instructions, region_restrictions,
   delivery_method, delivery_eta, low_stock_threshold, sort_order, created_at)
select
  s.slug, s.name, s.short_description, s.description, s.product_type, 'USD', 'active', 'public',
  true, (select verifier_id from seed_ctx), now(),
  s.provider_name, s.featured, s.terms, s.redemption_instructions, s.region_restrictions,
  s.delivery_method, s.delivery_eta, s.low_stock_threshold, s.sort_order,
  now() - (s.created_days_ago || ' days')::interval
from seed_products as s
on conflict (slug) do nothing;

create temp table seed_variants (
  product_slug text not null,
  variant_name text not null,
  sku text not null,
  denomination_value numeric(18, 6) not null,
  sort_order integer not null
);

insert into seed_variants (product_slug, variant_name, sku, denomination_value, sort_order) values
  ('amazon-gift-card', '$40', 'AMZGC-40', 40, 10),
  ('amazon-gift-card', '$80', 'AMZGC-80', 80, 20),
  ('amazon-gift-card', '$160', 'AMZGC-160', 160, 30),
  ('amazon-gift-card', '$200', 'AMZGC-200', 200, 40),
  ('apple-gift-card', '$40', 'APPLGC-40', 40, 10),
  ('apple-gift-card', '$80', 'APPLGC-80', 80, 20),
  ('apple-gift-card', '$160', 'APPLGC-160', 160, 30),
  ('apple-gift-card', '$200', 'APPLGC-200', 200, 40),
  ('google-play-gift-card', '$40', 'GPLAY-40', 40, 10),
  ('google-play-gift-card', '$80', 'GPLAY-80', 80, 20),
  ('google-play-gift-card', '$160', 'GPLAY-160', 160, 30),
  ('playstation-store-gift-card', '$40', 'PSN-40', 40, 10),
  ('playstation-store-gift-card', '$80', 'PSN-80', 80, 20),
  ('playstation-store-gift-card', '$160', 'PSN-160', 160, 30),
  ('playstation-store-gift-card', '$200', 'PSN-200', 200, 40),
  ('xbox-gift-card', '$40', 'XBX-40', 40, 10),
  ('xbox-gift-card', '$80', 'XBX-80', 80, 20),
  ('xbox-gift-card', '$160', 'XBX-160', 160, 30),
  ('steam-gift-card', '$40', 'STM-40', 40, 10),
  ('steam-gift-card', '$80', 'STM-80', 80, 20),
  ('steam-gift-card', '$160', 'STM-160', 160, 30),
  ('steam-gift-card', '$200', 'STM-200', 200, 40),
  ('entertainment-voucher', '$40', 'SPOTV-40', 40, 10),
  ('entertainment-voucher', '$80', 'SPOTV-80', 80, 20),
  ('entertainment-voucher', '$160', 'SPOTV-160', 160, 30),
  ('shopping-voucher', '$40', 'CHOICE-40', 40, 10),
  ('shopping-voucher', '$80', 'CHOICE-80', 80, 20),
  ('shopping-voucher', '$160', 'CHOICE-160', 160, 30),
  ('shopping-voucher', '$200', 'CHOICE-200', 200, 40),
  ('shopping-voucher', '$350', 'CHOICE-350', 350, 50),
  ('gaming-voucher', '$40', 'ARCV-40', 40, 10),
  ('gaming-voucher', '$80', 'ARCV-80', 80, 20),
  ('gaming-voucher', '$160', 'ARCV-160', 160, 30),
  ('wellness-voucher', '$40', 'SERN-40', 40, 10),
  ('wellness-voucher', '$80', 'SERN-80', 80, 20),
  ('wellness-voucher', '$160', 'SERN-160', 160, 30),
  ('wellness-voucher', '$200', 'SERN-200', 200, 40),
  ('officesuite-pro-1-year', '1-Year / 1 Device', 'OFSP-160', 160, 10),
  ('officesuite-pro-1-year', '1-Year / 5 Devices', 'OFSP-350', 350, 20),
  ('secureshield-antivirus-1-year', '1-Year / 1 Device', 'SECSH-40', 40, 10),
  ('secureshield-antivirus-1-year', '1-Year / 3 Devices', 'SECSH-80', 80, 20),
  ('secureshield-antivirus-1-year', '1-Year / 5 Devices', 'SECSH-160', 160, 30),
  ('pixelforge-creative-annual', 'Annual / Individual', 'PXFG-350', 350, 10),
  ('pixelforge-creative-annual', 'Annual / Team 5 Seats', 'PXFG-750', 750, 20),
  ('devtools-pro-ide-annual', 'Annual / Individual', 'DEVPR-200', 200, 10),
  ('devtools-pro-ide-annual', 'Annual / Team 5 Seats', 'DEVPR-500', 500, 20),
  ('vaultpass-manager-1-year', '1-Year / Individual', 'VLTP-40', 40, 10),
  ('vaultpass-manager-1-year', '1-Year / Family', 'VLTP-80', 80, 20),
  ('novaai-api-credits', '$40', 'NVAI-40', 40, 10),
  ('novaai-api-credits', '$80', 'NVAI-80', 80, 20),
  ('novaai-api-credits', '$160', 'NVAI-160', 160, 30),
  ('novaai-api-credits', '$200', 'NVAI-200', 200, 40),
  ('novaai-api-credits', '$350', 'NVAI-350', 350, 50),
  ('novaai-api-credits', '$500', 'NVAI-500', 500, 60),
  ('pixelmind-image-credits', '$40', 'PXMND-40', 40, 10),
  ('pixelmind-image-credits', '$80', 'PXMND-80', 80, 20),
  ('pixelmind-image-credits', '$160', 'PXMND-160', 160, 30),
  ('clouddocs-workspace-credits', '$80', 'CLDOC-80', 80, 10),
  ('clouddocs-workspace-credits', '$160', 'CLDOC-160', 160, 20),
  ('clouddocs-workspace-credits', '$350', 'CLDOC-350', 350, 30),
  ('meetflow-pro-credits', '$40', 'MTFLW-40', 40, 10),
  ('meetflow-pro-credits', '$80', 'MTFLW-80', 80, 20),
  ('meetflow-pro-credits', '$160', 'MTFLW-160', 160, 30),
  ('meetflow-pro-credits', '$200', 'MTFLW-200', 200, 40),
  ('dataquery-scale-credits', '$200', 'DATAQ-200', 200, 10),
  ('dataquery-scale-credits', '$350', 'DATAQ-350', 350, 20),
  ('dataquery-scale-credits', '$500', 'DATAQ-500', 500, 30),
  ('dataquery-scale-credits', '$750', 'DATAQ-750', 750, 40),
  ('dataquery-scale-credits', '$1000', 'DATAQ-1000', 1000, 50),
  ('dataquery-scale-credits', '$1500', 'DATAQ-1500', 1500, 60),
  ('dataquery-scale-credits', '$2000', 'DATAQ-2000', 2000, 70),
  ('dataquery-scale-credits', '$2500', 'DATAQ-2500', 2500, 80),
  ('dataquery-scale-credits', '$3000', 'DATAQ-3000', 3000, 90),
  ('nintendo-eshop-card', '$40', 'NES-40', 40, 10),
  ('nintendo-eshop-card', '$80', 'NES-80', 80, 20),
  ('nintendo-eshop-card', '$160', 'NES-160', 160, 30),
  ('fortnite-vbucks-card', '$40', 'VBUX-40', 40, 10),
  ('fortnite-vbucks-card', '$80', 'VBUX-80', 80, 20),
  ('fortnite-vbucks-card', '$160', 'VBUX-160', 160, 30),
  ('roblox-credit', '$40', 'RBLX-40', 40, 10),
  ('roblox-credit', '$80', 'RBLX-80', 80, 20),
  ('roblox-credit', '$160', 'RBLX-160', 160, 30),
  ('roblox-credit', '$200', 'RBLX-200', 200, 40),
  ('riot-points-card', '$40', 'RIOT-40', 40, 10),
  ('riot-points-card', '$80', 'RIOT-80', 80, 20),
  ('riot-points-card', '$160', 'RIOT-160', 160, 30),
  ('blizzard-balance-card', '$40', 'BLIZZ-40', 40, 10),
  ('blizzard-balance-card', '$80', 'BLIZZ-80', 80, 20),
  ('blizzard-balance-card', '$160', 'BLIZZ-160', 160, 30),
  ('blizzard-balance-card', '$200', 'BLIZZ-200', 200, 40),
  ('streamwave-premium', '1 Month', 'STRMW-40', 40, 10),
  ('streamwave-premium', '6 Months', 'STRMW-160', 160, 20),
  ('streamwave-premium', '12 Months', 'STRMW-350', 350, 30),
  ('musicflow-plus', '1 Month', 'MUSFL-40', 40, 10),
  ('musicflow-plus', '12 Months', 'MUSFL-350', 350, 20),
  ('cloudvault-2tb', '1 Month', 'CLVLT-40', 40, 10),
  ('cloudvault-2tb', '12 Months', 'CLVLT-200', 200, 20),
  ('arcadeplay-pass', '1 Month', 'ARCP-40', 40, 10),
  ('arcadeplay-pass', '3 Months', 'ARCP-80', 80, 20),
  ('arcadeplay-pass', '12 Months', 'ARCP-350', 350, 30),
  ('novaai-pro-subscription', 'Monthly', 'NVAIP-80', 80, 10),
  ('novaai-pro-subscription', 'Annual', 'NVAIP-750', 750, 20);

insert into public.product_variants (product_id, variant_name, sku, denomination_value, status, sort_order)
select product.id, v.variant_name, v.sku, v.denomination_value, 'active', v.sort_order
from seed_variants as v
join public.products as product on product.slug = v.product_slug
on conflict (sku) do nothing;

-- Prices: one per variant at face value. Everything is staff-fulfilled
-- (unlimited/manual) EXCEPT the SKUs listed below, which are code-inventory
-- products (digital/inventory). Those SKUs have zero digital_inventory rows,
-- so the storefront reports them accurately as unavailable until the owner
-- imports real codes with public.admin_import_digital_inventory.
-- Scoped to the 30 seed product slugs so re-runs never touch owner products.
insert into public.product_prices (product_id, variant_id, amount, availability_mode, fulfillment_mode)
select
  variant.product_id,
  variant.id,
  variant.denomination_value,
  case when variant.sku in (
    'NES-40', 'NES-80', 'NES-160',
    'RIOT-40', 'RIOT-80', 'RIOT-160',
    'BLIZZ-40', 'BLIZZ-80', 'BLIZZ-160', 'BLIZZ-200',
    'DATAQ-1500', 'DATAQ-2000', 'DATAQ-2500', 'DATAQ-3000'
  ) then 'digital' else 'unlimited' end,
  case when variant.sku in (
    'NES-40', 'NES-80', 'NES-160',
    'RIOT-40', 'RIOT-80', 'RIOT-160',
    'BLIZZ-40', 'BLIZZ-80', 'BLIZZ-160', 'BLIZZ-200',
    'DATAQ-1500', 'DATAQ-2000', 'DATAQ-2500', 'DATAQ-3000'
  ) then 'inventory' else 'manual' end
from public.product_variants as variant
join public.products as product on product.id = variant.product_id
where product.slug in (
  'amazon-gift-card', 'apple-gift-card', 'google-play-gift-card',
  'playstation-store-gift-card', 'xbox-gift-card', 'steam-gift-card',
  'entertainment-voucher', 'shopping-voucher', 'gaming-voucher', 'wellness-voucher',
  'officesuite-pro-1-year', 'secureshield-antivirus-1-year', 'pixelforge-creative-annual',
  'devtools-pro-ide-annual', 'vaultpass-manager-1-year',
  'novaai-api-credits', 'pixelmind-image-credits', 'clouddocs-workspace-credits',
  'meetflow-pro-credits', 'dataquery-scale-credits',
  'nintendo-eshop-card', 'fortnite-vbucks-card', 'roblox-credit',
  'riot-points-card', 'blizzard-balance-card',
  'streamwave-premium', 'musicflow-plus', 'cloudvault-2tb',
  'arcadeplay-pass', 'novaai-pro-subscription'
)
on conflict (product_id, variant_id) where variant_id is not null do nothing;

create temp table seed_product_categories (
  product_slug text not null,
  category_slug text not null
);

insert into seed_product_categories (product_slug, category_slug) values
  ('amazon-gift-card', 'digital-gift-cards'),
  ('apple-gift-card', 'digital-gift-cards'),
  ('google-play-gift-card', 'digital-gift-cards'),
  ('playstation-store-gift-card', 'digital-gift-cards'),
  ('xbox-gift-card', 'digital-gift-cards'),
  ('steam-gift-card', 'digital-gift-cards'),
  ('entertainment-voucher', 'digital-vouchers'),
  ('shopping-voucher', 'digital-vouchers'),
  ('gaming-voucher', 'digital-vouchers'),
  ('wellness-voucher', 'digital-vouchers'),
  ('officesuite-pro-1-year', 'software-licenses'),
  ('secureshield-antivirus-1-year', 'software-licenses'),
  ('pixelforge-creative-annual', 'software-licenses'),
  ('devtools-pro-ide-annual', 'software-licenses'),
  ('vaultpass-manager-1-year', 'software-licenses'),
  ('novaai-api-credits', 'ai-saas-credits'),
  ('pixelmind-image-credits', 'ai-saas-credits'),
  ('clouddocs-workspace-credits', 'ai-saas-credits'),
  ('meetflow-pro-credits', 'ai-saas-credits'),
  ('dataquery-scale-credits', 'ai-saas-credits'),
  ('nintendo-eshop-card', 'gaming-credits'),
  ('fortnite-vbucks-card', 'gaming-credits'),
  ('roblox-credit', 'gaming-credits'),
  ('riot-points-card', 'gaming-credits'),
  ('blizzard-balance-card', 'gaming-credits'),
  ('streamwave-premium', 'digital-subscriptions'),
  ('musicflow-plus', 'digital-subscriptions'),
  ('cloudvault-2tb', 'digital-subscriptions'),
  ('arcadeplay-pass', 'digital-subscriptions'),
  ('novaai-pro-subscription', 'digital-subscriptions');

insert into public.product_categories (product_id, category_id)
select product.id, category.id
from seed_product_categories as m
join public.products as product on product.slug = m.product_slug
join public.categories as category on category.slug = m.category_slug
on conflict do nothing;

create temp table seed_deals (
  product_slug text not null,
  discount_type text not null,
  discount_value numeric(14, 4) not null,
  currency_code text,
  starts_days_ago integer not null,
  ends_in_days integer,
  priority integer not null
);

insert into seed_deals
  (product_slug, discount_type, discount_value, currency_code, starts_days_ago, ends_in_days, priority)
values
  ('steam-gift-card', 'percent', 10, null, 1, 7, 0),
  ('playstation-store-gift-card', 'percent', 15, null, 2, 3, 0),
  ('xbox-gift-card', 'amount', 8, 'USD', 1, 14, 0),
  ('shopping-voucher', 'percent', 12, null, 3, 7, 0),
  ('pixelforge-creative-annual', 'percent', 20, null, 1, 5, 0),
  ('novaai-api-credits', 'percent', 10, null, 1, 10, 0),
  ('roblox-credit', 'percent', 5, null, 5, 30, 0),
  ('streamwave-premium', 'percent', 25, null, 1, 2, 0);

insert into public.product_deals
  (product_id, variant_id, discount_type, discount_value, currency_code, status, starts_at, ends_at, priority)
select
  product.id, null, d.discount_type, d.discount_value, d.currency_code, 'active',
  now() - (d.starts_days_ago || ' days')::interval,
  case when d.ends_in_days is null then null else now() + (d.ends_in_days || ' days')::interval end,
  d.priority
from seed_deals as d
join public.products as product on product.slug = d.product_slug
where not exists (
  select 1 from public.product_deals as existing where existing.product_id = product.id
);

-- Summary notice for whoever runs the seed (visible in SQL editor output).
do $$
declare
  c_categories integer; c_products integer; c_variants integer;
  c_prices integer; c_deals integer; c_unavailable integer;
begin
  select count(*) into c_categories from public.categories where slug in (select slug from seed_categories);
  select count(*) into c_products from public.products where slug in (select slug from seed_products);
  select count(*) into c_variants from public.product_variants where sku in (select sku from seed_variants);
  select count(*) into c_prices from public.product_prices as price
    join public.product_variants as variant on variant.id = price.variant_id
    where variant.sku in (select sku from seed_variants);
  select count(*) into c_deals from public.product_deals as deal
    join public.products as product on product.id = deal.product_id
    where product.slug in (select product_slug from seed_deals) and deal.status = 'active';
  select count(*) into c_unavailable from public.product_prices as price
    join public.product_variants as variant on variant.id = price.variant_id
    where variant.sku in (select sku from seed_variants) and price.availability_mode = 'digital';
  raise notice 'XSHOP seed complete: % categories, % products, % variants, % prices, % active deals (% digital-mode prices awaiting real code imports).',
    c_categories, c_products, c_variants, c_prices, c_deals, c_unavailable;
end $$;

commit;
