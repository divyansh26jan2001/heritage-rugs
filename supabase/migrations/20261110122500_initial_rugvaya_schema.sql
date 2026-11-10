-- Rugvaya marketplace: initial production schema
-- This migration creates the shared database foundation. It intentionally does
-- not import the browser-only demo shops, sample products, or sample orders.

begin;

-- ---------------------------------------------------------------------------
-- Shared updated_at trigger
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- Profiles and role protection
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,
  full_name text,
  avatar_url text,
  role text not null default 'customer'
    check (role in ('customer', 'seller', 'admin')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = (select auth.uid())
      and p.role = 'admin'
  );
$$;

create or replace function public.guard_profile_role_change()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null
     and new.role is distinct from old.role
     and not public.is_admin() then
    raise exception 'Only a Rugvaya administrator can change account roles';
  end if;

  return new;
end;
$$;

drop trigger if exists profiles_set_updated_at on public.profiles;
create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function public.set_updated_at();

drop trigger if exists profiles_guard_role_change on public.profiles;
create trigger profiles_guard_role_change
before update on public.profiles
for each row execute function public.guard_profile_role_change();

create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  supplied_name text;
begin
  supplied_name := nullif(trim(coalesce(new.raw_user_meta_data ->> 'full_name', '')), '');

  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(supplied_name, nullif(split_part(coalesce(new.email, ''), '@', 1), ''))
  )
  on conflict (id) do update
    set email = excluded.email;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_rugvaya on auth.users;
create trigger on_auth_user_created_rugvaya
after insert on auth.users
for each row execute function public.handle_new_auth_user();

-- ---------------------------------------------------------------------------
-- Shops and seller applications
-- ---------------------------------------------------------------------------
create table if not exists public.shops (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete restrict,
  name text not null check (char_length(trim(name)) between 2 and 80),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  owner_name text not null,
  owner_email text not null,
  location text not null,
  description text not null default '',
  initials text,
  banner_url text,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended')),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists shops_owner_id_idx on public.shops(owner_id);
create index if not exists shops_status_idx on public.shops(status);
create index if not exists shops_created_at_idx on public.shops(created_at desc);

create or replace function public.is_shop_owner(p_shop_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.shops s
    where s.id = p_shop_id
      and s.owner_id = (select auth.uid())
  );
$$;

create or replace function public.is_shop_owner_folder(p_shop_id_text text)
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1
    from public.shops s
    where s.id::text = p_shop_id_text
      and s.owner_id = (select auth.uid())
  );
$$;

create or replace function public.guard_shop_moderation_fields()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if new.owner_id is distinct from old.owner_id
       or new.status is distinct from old.status
       or new.reviewed_at is distinct from old.reviewed_at
       or new.reviewed_by is distinct from old.reviewed_by then
      raise exception 'Only a Rugvaya administrator can change shop ownership or approval status';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists shops_set_updated_at on public.shops;
create trigger shops_set_updated_at
before update on public.shops
for each row execute function public.set_updated_at();

drop trigger if exists shops_guard_moderation_fields on public.shops;
create trigger shops_guard_moderation_fields
before update on public.shops
for each row execute function public.guard_shop_moderation_fields();

create table if not exists public.seller_applications (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null unique references public.shops(id) on delete cascade,
  applicant_id uuid not null references auth.users(id) on delete restrict,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected', 'suspended')),
  applied_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer_id uuid references auth.users(id) on delete set null,
  review_notes text
);

create index if not exists seller_applications_applicant_id_idx
  on public.seller_applications(applicant_id);
create index if not exists seller_applications_status_idx
  on public.seller_applications(status);

create or replace function public.create_seller_application_for_shop()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.seller_applications (shop_id, applicant_id, status)
  values (new.id, new.owner_id, new.status)
  on conflict (shop_id) do nothing;

  return new;
end;
$$;

drop trigger if exists shops_create_seller_application on public.shops;
create trigger shops_create_seller_application
after insert on public.shops
for each row execute function public.create_seller_application_for_shop();

create or replace function public.sync_seller_application_status()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status then
    update public.seller_applications
       set status = new.status,
           reviewed_at = case when new.status = 'pending' then null else now() end,
           reviewer_id = case when public.is_admin() then auth.uid() else null end
     where shop_id = new.id;

    if new.status = 'approved' then
      update public.profiles
         set role = 'seller'
       where id = new.owner_id
         and role = 'customer';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists shops_sync_seller_application_status on public.shops;
create trigger shops_sync_seller_application_status
after update of status on public.shops
for each row execute function public.sync_seller_application_status();

-- ---------------------------------------------------------------------------
-- Products
-- ---------------------------------------------------------------------------
create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  shop_id uuid not null references public.shops(id) on delete cascade,
  name text not null check (char_length(trim(name)) between 2 and 180),
  category text not null default 'Traditional',
  price numeric(12, 2) not null check (price >= 0),
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  stock integer not null default 0 check (stock >= 0),
  size text,
  sizes text[] not null default '{}',
  style text,
  material text,
  color text,
  technique text,
  origin text,
  tags text[] not null default '{}',
  description text not null default '',
  long_description text not null default '',
  care_instructions text not null default '',
  cover_image_url text,
  image_urls text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'archived')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_shop_id_idx on public.products(shop_id);
create index if not exists products_status_stock_idx on public.products(status, stock);
create index if not exists products_created_at_idx on public.products(created_at desc);

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
before update on public.products
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Orders and order line-item snapshots
-- Order creation is intentionally server-side only for now. Do not let a
-- browser submit its own total or payment status.
-- ---------------------------------------------------------------------------
create table if not exists public.orders (
  id uuid primary key default gen_random_uuid(),
  order_number text not null unique
    default ('RV-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 10))),
  customer_id uuid references auth.users(id) on delete set null,
  customer_name text not null,
  customer_email text not null,
  customer_phone text,
  shipping_address jsonb not null default '{}'::jsonb,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  subtotal numeric(12, 2) not null default 0 check (subtotal >= 0),
  shipping_amount numeric(12, 2) not null default 0 check (shipping_amount >= 0),
  discount_amount numeric(12, 2) not null default 0 check (discount_amount >= 0),
  tax_amount numeric(12, 2) not null default 0 check (tax_amount >= 0),
  total numeric(12, 2) not null default 0 check (total >= 0),
  status text not null default 'pending'
    check (status in ('pending', 'confirmed', 'processing', 'shipped', 'delivered', 'cancelled', 'refunded')),
  payment_status text not null default 'unpaid'
    check (payment_status in ('unpaid', 'pending', 'paid', 'failed', 'refunded')),
  payment_reference text,
  tracking_number text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists orders_customer_id_idx on public.orders(customer_id);
create index if not exists orders_status_idx on public.orders(status);
create index if not exists orders_created_at_idx on public.orders(created_at desc);

create table if not exists public.order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references public.orders(id) on delete cascade,
  product_id uuid references public.products(id) on delete set null,
  shop_id uuid not null references public.shops(id) on delete restrict,
  product_name text not null,
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2) not null check (unit_price >= 0),
  line_total numeric(12, 2) not null check (line_total >= 0),
  created_at timestamptz not null default now()
);

create index if not exists order_items_order_id_idx on public.order_items(order_id);
create index if not exists order_items_shop_id_idx on public.order_items(shop_id);

drop trigger if exists orders_set_updated_at on public.orders;
create trigger orders_set_updated_at
before update on public.orders
for each row execute function public.set_updated_at();

-- ---------------------------------------------------------------------------
-- Row Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles enable row level security;
alter table public.shops enable row level security;
alter table public.seller_applications enable row level security;
alter table public.products enable row level security;
alter table public.orders enable row level security;
alter table public.order_items enable row level security;

drop policy if exists "profiles_select_self_or_admin" on public.profiles;
create policy "profiles_select_self_or_admin"
on public.profiles for select
to authenticated
using (id = (select auth.uid()) or public.is_admin());

drop policy if exists "profiles_update_self_or_admin" on public.profiles;
create policy "profiles_update_self_or_admin"
on public.profiles for update
to authenticated
using (id = (select auth.uid()) or public.is_admin())
with check (id = (select auth.uid()) or public.is_admin());

drop policy if exists "shops_public_or_owner_read" on public.shops;
create policy "shops_public_or_owner_read"
on public.shops for select
to anon, authenticated
using (status = 'approved' or owner_id = (select auth.uid()) or public.is_admin());

drop policy if exists "shops_owner_create_pending" on public.shops;
create policy "shops_owner_create_pending"
on public.shops for insert
to authenticated
with check (owner_id = (select auth.uid()) and status = 'pending');

drop policy if exists "shops_owner_or_admin_update" on public.shops;
create policy "shops_owner_or_admin_update"
on public.shops for update
to authenticated
using (owner_id = (select auth.uid()) or public.is_admin())
with check (owner_id = (select auth.uid()) or public.is_admin());

drop policy if exists "shops_admin_delete" on public.shops;
create policy "shops_admin_delete"
on public.shops for delete
to authenticated
using (public.is_admin());

drop policy if exists "seller_applications_owner_or_admin_read" on public.seller_applications;
create policy "seller_applications_owner_or_admin_read"
on public.seller_applications for select
to authenticated
using (applicant_id = (select auth.uid()) or public.is_admin());

drop policy if exists "seller_applications_admin_manage" on public.seller_applications;
create policy "seller_applications_admin_manage"
on public.seller_applications for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "products_public_or_owner_read" on public.products;
create policy "products_public_or_owner_read"
on public.products for select
to anon, authenticated
using (
  (
    status = 'published'
    and stock > 0
    and exists (
      select 1 from public.shops s
      where s.id = products.shop_id
        and s.status = 'approved'
    )
  )
  or public.is_shop_owner(shop_id)
  or public.is_admin()
);

drop policy if exists "products_owner_or_admin_create" on public.products;
create policy "products_owner_or_admin_create"
on public.products for insert
to authenticated
with check (
  public.is_admin()
  or (
    public.is_shop_owner(shop_id)
    and exists (
      select 1 from public.shops s
      where s.id = products.shop_id
        and s.status = 'approved'
    )
  )
);

drop policy if exists "products_owner_or_admin_update" on public.products;
create policy "products_owner_or_admin_update"
on public.products for update
to authenticated
using (public.is_admin() or public.is_shop_owner(shop_id))
with check (public.is_admin() or public.is_shop_owner(shop_id));

drop policy if exists "products_owner_or_admin_delete" on public.products;
create policy "products_owner_or_admin_delete"
on public.products for delete
to authenticated
using (public.is_admin() or public.is_shop_owner(shop_id));

drop policy if exists "orders_customer_or_admin_read" on public.orders;
create policy "orders_customer_or_admin_read"
on public.orders for select
to authenticated
using (customer_id = (select auth.uid()) or public.is_admin());

drop policy if exists "orders_admin_manage" on public.orders;
create policy "orders_admin_manage"
on public.orders for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

drop policy if exists "order_items_customer_seller_or_admin_read" on public.order_items;
create policy "order_items_customer_seller_or_admin_read"
on public.order_items for select
to authenticated
using (
  public.is_shop_owner(shop_id)
  or public.is_admin()
  or exists (
    select 1
    from public.orders o
    where o.id = order_items.order_id
      and o.customer_id = (select auth.uid())
  )
);

drop policy if exists "order_items_admin_manage" on public.order_items;
create policy "order_items_admin_manage"
on public.order_items for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

-- ---------------------------------------------------------------------------
-- Public image buckets. Objects are stored under:
--   product-images/<shop-uuid>/<file-name>
--   shop-assets/<shop-uuid>/<file-name>
-- ---------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  (
    'rugvaya-product-images',
    'rugvaya-product-images',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  ),
  (
    'rugvaya-shop-assets',
    'rugvaya-shop-assets',
    true,
    10485760,
    array['image/jpeg', 'image/png', 'image/webp']
  )
on conflict (id) do update
set public = excluded.public,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "rugvaya_public_images_read" on storage.objects;
create policy "rugvaya_public_images_read"
on storage.objects for select
to anon, authenticated
using (bucket_id in ('rugvaya-product-images', 'rugvaya-shop-assets'));

drop policy if exists "rugvaya_sellers_upload_product_images" on storage.objects;
create policy "rugvaya_sellers_upload_product_images"
on storage.objects for insert
to authenticated
with check (
  bucket_id = 'rugvaya-product-images'
  and public.is_shop_owner_folder((storage.foldername(name))[1])
);

drop policy if exists "rugvaya_sellers_update_product_images" on storage.objects;
create policy "rugvaya_sellers_update_product_images"
on storage.objects for update
to authenticated
using (
  bucket_id = 'rugvaya-product-images'
  and public.is_shop_owner_folder((storage.foldername(name))[1])
)
with check (
  bucket_id = 'rugvaya-product-images'
  and public.is_shop_owner_folder((storage.foldername(name))[1])
);

drop policy if exists "rugvaya_sellers_delete_product_images" on storage.objects;
create policy "rugvaya_sellers_delete_product_images"
on storage.objects for delete
to authenticated
using (
  bucket_id = 'rugvaya-product-images'
  and public.is_shop_owner_folder((storage.foldername(name))[1])
);

drop policy if exists "rugvaya_sellers_manage_shop_assets" on storage.objects;
create policy "rugvaya_sellers_manage_shop_assets"
on storage.objects for all
to authenticated
using (
  bucket_id = 'rugvaya-shop-assets'
  and public.is_shop_owner_folder((storage.foldername(name))[1])
)
with check (
  bucket_id = 'rugvaya-shop-assets'
  and public.is_shop_owner_folder((storage.foldername(name))[1])
);

commit;
