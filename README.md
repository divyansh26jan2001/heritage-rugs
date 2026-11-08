# Heritage Rugs — Storefront & Admin Prototype

An Etsy-inspired, responsive storefront prototype for a premium handmade-rug business, with a separate demo admin dashboard.

## Live demo

https://divyansh26jan2001.github.io/heritage-rugs/

## Run locally

On macOS, double-click **Start Heritage Rugs.command**. Keep the Terminal window open while testing; press `Control+C` to stop it.

On any operating system, run `python3 -m http.server 8000` from this folder, then open <http://localhost:8000>.

## Demo admin sign-in

- Username: `admin`
- Password: `RugsDemo2026!`

**Public demo warning:** this prototype login is not real authentication. The demo credentials are visible in the public source code and anyone can access the demo admin interface. Do not reuse this password, enter real customer data, store business secrets, or accept actual orders/payments through this prototype.

## Included demo features

- Photo-based storefront, collection tiles and product cards
- Shareable product detail pages using URLs such as `#product/101`
- Product gallery, size selector, quantity controls and related rugs
- Product search, collection filters, sorting and wishlist
- Shopping bag and demo checkout
- Admin dashboard, photo options for products, listing management and order-status controls
- Demo tracking-reference fields and browser-local persistence

## Image credits and catalogue note

The current sample photography is sourced from photos published under the Unsplash License:
- Fred Kleber — living-room / carpet setting
- Aman Chaturvedi — interior with carpet
- Quang Tran — Persian carpet detail
- Nik — Persian carpet with geometric patterns
- Rugs Forever — woven rug detail
- Amir Tohi — carpet/rug assortment
- Mina Rad — oriental rug detail

These are visual placeholders for the prototype, not the business's actual product inventory. Replace them with the seller's own Etsy product photography before accepting orders.

## Prototype limitations

This is a front-end demonstration. Data is stored in the current browser using `localStorage`. It has no production database, WordPress/WooCommerce integration, real customer accounts, payment processing, tax calculation, shipping provider, courier tracking API, transactional email or production security. Do not accept real payments or customer orders through this prototype.

## Before taking real orders

1. Connect WordPress + WooCommerce (or another production e-commerce backend).
2. Replace demo login with secure server-side authentication and role-based access.
3. Configure a payment provider supported for the merchant's business location and intended US sales.
4. Configure shipping, taxes, order emails, tracking, SEO, backups and security.
5. Test checkout and fulfilment end to end.

## Admin product listings (prototype)

The Add/Edit Listing form supports up to 8 photos per product, a selectable cover photo, comma-separated tags, multiple sizes, material, colour, weaving technique, origin, short and full descriptions, care instructions, price, stock and publish/draft status. Selected photos are resized in the browser before saving.

**Important storage limitation:** this GitHub Pages version saves admin changes and uploaded photos in the current browser's `localStorage` only. They are not uploaded to GitHub or a shared cloud database, so other customers/devices will not see newly added listings. Browser storage has a size limit and can be cleared. Before real store use, connect WordPress/WooCommerce or a server-side database and media storage.
