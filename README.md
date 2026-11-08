# Heritage Rugs — Storefront & Admin Prototype

An Etsy-inspired, responsive storefront prototype for a premium handmade-rug business, with a separate demo admin dashboard. The repository includes local SVG artwork so the demo imagery loads without third-party image hosts.

## Run locally

On macOS, double-click **Start Heritage Rugs.command**. Keep the Terminal window open while testing; press `Control+C` to stop it.

On any operating system, run `python3 -m http.server 8000` from this folder, then open <http://localhost:8000>.

## Demo admin sign-in

- Username: `admin`
- Password: `RugsDemo2026!`

**Security warning:** this is a front-end-only demonstration. The demo credentials are visible in JavaScript and are not secure authentication. Do not reuse this password, place real customer data here, or treat this as a production admin system. Keep this repository private until the demo login is replaced.

## Included demo features

- Responsive storefront with local, self-contained rug and interior artwork
- Product collections, search, sorting and quick views
- Wishlist and shopping bag interactions
- Demo checkout and sample orders
- Admin dashboard, product listing management and order-status controls
- Demo tracking-reference fields and browser-local persistence

## Prototype limitations

This project is not yet a live store. Data is stored in the current browser using `localStorage`. It has no production database, WordPress/WooCommerce integration, real customer accounts, payment processing, tax calculation, shipping provider, courier tracking API, transactional email or production security. Do not accept real payments or customer orders through this prototype.

## Before public launch

1. Connect WordPress + WooCommerce (or another production e-commerce backend).
2. Migrate the product catalogue and replace demo login with secure server-side authentication and role-based access.
3. Configure a payment provider that supports the merchant's business location and intended US sales.
4. Configure shipping, taxes, order emails, tracking, SEO, backups and security.
5. Test checkout and fulfilment end to end before accepting real orders.
