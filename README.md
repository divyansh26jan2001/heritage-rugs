# Heritage Rugs — Storefront & Admin Prototype

An Etsy-inspired, responsive storefront prototype for a premium handmade-rug business, with a separate demo admin dashboard. Local SVG artwork is included so images load without third-party image hosts.

## Live demo

Once GitHub Pages is enabled for this repository, the site will be available at:

https://divyansh26jan2001.github.io/heritage-rugs/

## Run locally

On macOS, double-click **Start Heritage Rugs.command**. Keep the Terminal window open while testing; press `Control+C` to stop it.

On any operating system, run `python3 -m http.server 8000` from this folder, then open <http://localhost:8000>.

## Demo admin sign-in

- Username: `admin`
- Password: `RugsDemo2026!`

**Public demo warning:** this prototype login is not real authentication. The demo credentials are visible in the public source code and anyone can access the demo admin interface. Do not reuse this password, enter real customer data, store business secrets, or accept actual orders/payments through this prototype.

## Included demo features

- Responsive storefront with local rug and interior illustrations
- Product collections, search, sorting and quick views
- Wishlist and shopping bag interactions
- Demo checkout and sample orders
- Admin dashboard, product listing management and order-status controls
- Demo tracking-reference fields and browser-local persistence

## Prototype limitations

This is a front-end demonstration. Data is stored in the current browser using `localStorage`. It has no production database, WordPress/WooCommerce integration, real customer accounts, payment processing, tax calculation, shipping provider, courier tracking API, transactional email or production security. Do not accept real payments or customer orders through this prototype.

## Before taking real orders

1. Connect WordPress + WooCommerce (or another production e-commerce backend).
2. Replace demo login with secure server-side authentication and role-based access.
3. Configure a payment provider supported for the merchant's business location and intended US sales.
4. Configure shipping, taxes, order emails, tracking, SEO, backups and security.
5. Test checkout and fulfilment end to end.
