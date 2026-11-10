# Rugvaya — first-time Supabase setup

## What is already in the repository

- Supabase GitHub production integration is configured for `main`.
- `supabase/migrations/` contains the profile, shop, seller-approval, product, order, cart, wishlist, newsletter, storage and RLS schema.
- The eight earlier catalogue previews are inserted into Supabase as **Draft** products. Their displayed prices were reference/demo prices, not confirmed Rugvaya prices, so they are not published to buyers.
- The frontend uses Supabase Auth and the Supabase database client. Normal storefront and admin writes do not use browser localStorage.

## One-time dashboard steps

1. Open Supabase Dashboard → Authentication → URL Configuration.
2. Set **Site URL** to:
   `https://divyansh26jan2001.github.io/heritage-rugs/`
3. Add this exact URL to **Redirect URLs**:
   `https://divyansh26jan2001.github.io/heritage-rugs/`
4. Ensure Email sign-ups are enabled.
5. Open the deployed Rugvaya site and create an account with the email address you will use as the store owner/admin.
6. Confirm the email link if Supabase email confirmation is enabled, then sign in on the site.
7. In Supabase → SQL Editor, open `supabase/FIRST_ADMIN_SETUP.sql`, replace `YOUR_SIGNUP_EMAIL@example.com` with the exact email used in step 5, and run the SQL.
8. Sign out and sign in again. The admin dashboard will now open for that account.

The admin bootstrap is deliberately a manual SQL action inside the project dashboard; a public website signup must never be able to grant itself admin privileges.

## Import earlier browser-only changes

The previous prototype may have custom shop/product edits saved in this one browser's `heritageRugsDemo` key. Sign in with the admin account, open Admin → Store settings → **Import previous browser data**, and run the one-time import.

- Product images that were data URLs are uploaded to Supabase Storage.
- Imported/edited products are kept as Draft for review; confirm prices, stock and permissions before publishing.
- The importer removes the old `heritageRugsDemo` key only after the import succeeds.
- Old sample/demo checkout records are intentionally skipped; they were not verified paid orders and must not be presented as real purchases.
- Browser-local cart/wishlist data can only be attributed to the account performing the import. Do not import another person's browser data into an admin account.

If the old browser data is not needed, do not run the importer. Normal site use does not read or write localStorage.

## What is not connected yet

- Payment gateway and payment confirmation/webhooks.
- Courier/shipping label integration.
- Custom SMTP for production-scale auth and order emails.
- Shop banner upload/edit; profile text changes save to Supabase, while the banner currently uses its default image.
