-- XSHOP Phase 2: identity/profile, role foundation, and storage buckets.
-- Apply to the intended Supabase project with the Supabase CLI or SQL editor.
-- This migration creates no catalog, order, payment, or digital-inventory tables.

begin;

create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
grant usage on schema private to authenticated;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text,
  display_name text check (display_name is null or char_length(display_name) <= 120),
  avatar_url text check (avatar_url is null or char_length(avatar_url) <= 2048),
  phone text check (phone is null or char_length(phone) <= 32),
  role text not null default 'customer'
    check (role in ('customer', 'support', 'admin', 'super_admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'XSHOP customer profile and server-managed authorization role; passwords remain in Supabase Auth.';
comment on column public.profiles.role is 'Assigned only by trusted database/service operations; never accepted from user metadata or client writes.';

create index if not exists profiles_role_idx on public.profiles (role);

alter table public.profiles enable row level security;
revoke all on table public.profiles from anon, authenticated;
grant select on table public.profiles to authenticated;
grant update (display_name, avatar_url, phone) on table public.profiles to authenticated;

create or replace function private.user_has_any_role(_allowed_roles text[])
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles as profile
    where profile.id = (select auth.uid())
      and profile.role = any (_allowed_roles)
  );
$$;

revoke all on function private.user_has_any_role(text[]) from public, anon;
grant execute on function private.user_has_any_role(text[]) to authenticated;

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

revoke all on function private.set_updated_at() from public, anon, authenticated;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, email, display_name, avatar_url, role)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'name'), '')
    ),
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'avatar_url'), ''),
      nullif(btrim(new.raw_user_meta_data ->> 'picture'), '')
    ),
    'customer'
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

revoke all on function private.handle_new_auth_user() from public, anon, authenticated;

drop trigger if exists xshop_profile_after_auth_signup on auth.users;
create trigger xshop_profile_after_auth_signup
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create or replace function private.sync_profile_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.profiles
  set email = new.email
  where id = new.id;

  return new;
end;
$$;

revoke all on function private.sync_profile_email() from public, anon, authenticated;

drop trigger if exists xshop_profile_after_auth_email_update on auth.users;
create trigger xshop_profile_after_auth_email_update
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function private.sync_profile_email();

-- Backfill existing Supabase Auth identities without inventing users or elevated roles.
insert into public.profiles (id, email, display_name, avatar_url, role)
select
  auth_user.id,
  auth_user.email,
  coalesce(
    nullif(btrim(auth_user.raw_user_meta_data ->> 'display_name'), ''),
    nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(auth_user.raw_user_meta_data ->> 'name'), '')
  ),
  coalesce(
    nullif(btrim(auth_user.raw_user_meta_data ->> 'avatar_url'), ''),
    nullif(btrim(auth_user.raw_user_meta_data ->> 'picture'), '')
  ),
  'customer'
from auth.users as auth_user
on conflict (id) do nothing;

drop policy if exists "XSHOP users and admins can read profiles" on public.profiles;
create policy "XSHOP users and admins can read profiles"
on public.profiles
for select
to authenticated
using (
  id = (select auth.uid())
  or (select private.user_has_any_role(array['admin', 'super_admin']))
);

drop policy if exists "XSHOP users can update permitted profile fields" on public.profiles;
create policy "XSHOP users can update permitted profile fields"
on public.profiles
for update
to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Public objects contain only approved storefront media. No policy grants anonymous
-- table listing; public bucket URLs may be fetched directly. Avatars remain private.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('product-media', 'product-media', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('store-assets', 'store-assets', true, 10485760, array['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
  ('avatars', 'avatars', false, 5242880, array['image/jpeg', 'image/png', 'image/webp', 'image/avif'])
on conflict (id) do nothing;

-- Store media writes and object-metadata access are reserved for trusted admin roles.
drop policy if exists "XSHOP admins can inspect store media objects" on storage.objects;
create policy "XSHOP admins can inspect store media objects"
on storage.objects
for select
to authenticated
using (
  bucket_id in ('product-media', 'store-assets')
  and (select private.user_has_any_role(array['admin', 'super_admin']))
);

drop policy if exists "XSHOP admins can upload store media" on storage.objects;
create policy "XSHOP admins can upload store media"
on storage.objects
for insert
to authenticated
with check (
  bucket_id in ('product-media', 'store-assets')
  and (select private.user_has_any_role(array['admin', 'super_admin']))
);

drop policy if exists "XSHOP admins can update store media" on storage.objects;
create policy "XSHOP admins can update store media"
on storage.objects
for update
to authenticated
using (
  bucket_id in ('product-media', 'store-assets')
  and (select private.user_has_any_role(array['admin', 'super_admin']))
)
with check (
  bucket_id in ('product-media', 'store-assets')
  and (select private.user_has_any_role(array['admin', 'super_admin']))
);

drop policy if exists "XSHOP admins can delete store media" on storage.objects;
create policy "XSHOP admins can delete store media"
on storage.objects
for delete
to authenticated
using (
  bucket_id in ('product-media', 'store-assets')
  and (select private.user_has_any_role(array['admin', 'super_admin']))
);

-- Avatar paths must be stored as <auth.uid()>/<filename>; users can access only their own folder.
drop policy if exists "XSHOP users can read their own avatars" on storage.objects;
create policy "XSHOP users can read their own avatars"
on storage.objects
for select
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "XSHOP users can upload their own avatars" on storage.objects;
create policy "XSHOP users can upload their own avatars"
on storage.objects
for insert
to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "XSHOP users can update their own avatars" on storage.objects;
create policy "XSHOP users can update their own avatars"
on storage.objects
for update
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

drop policy if exists "XSHOP users can delete their own avatars" on storage.objects;
create policy "XSHOP users can delete their own avatars"
on storage.objects
for delete
to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

commit;
