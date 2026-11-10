-- Rugvaya security/persistence follow-up
-- Allow admin-managed sample catalogue images while retaining owner-folder checks.
drop policy if exists "rugvaya_admin_manage_product_images" on storage.objects;
create policy "rugvaya_admin_manage_product_images"
on storage.objects for all
to authenticated
using (
  bucket_id in ('rugvaya-product-images', 'rugvaya-shop-assets')
  and public.is_admin()
)
with check (
  bucket_id in ('rugvaya-product-images', 'rugvaya-shop-assets')
  and public.is_admin()
);

drop policy if exists "rugvaya_admin_read_newsletter_subscribers" on public.newsletter_subscribers;
create policy "rugvaya_admin_read_newsletter_subscribers"
on public.newsletter_subscribers for select
to authenticated
using (public.is_admin());

-- Seller applications remain read-only for applicants; admins own review writes.
drop policy if exists "seller_applications_admin_manage" on public.seller_applications;
create policy "seller_applications_admin_manage"
on public.seller_applications for all
to authenticated
using (public.is_admin())
with check (public.is_admin());

