# Heritage Rugs — Storefront & Admin Prototype

A responsive Etsy-inspired storefront prototype for a premium handmade-rug business, with a separate demo admin dashboard.

## Run locally

### macOS
Double-click **Start Heritage Rugs.command**. It starts a local web server and opens the site in your browser. Keep Terminal open while testing; press `Control+C` to stop it.

### Any operating system
From this folder, run:

```bash
python3 -m http.server 8000
```

Then open <http://localhost:8000>.

## Demo admin sign-in

- Username: `admin`
- Password: `RugsDemo2026!`

**Security warning:** this is a front-end-only demonstration. The demo credentials are visible in the JavaScript and are not secure authentication. Do not reuse this password, place real customer data here, or treat this as a production admin system.

## Included demo features

- Responsive storefront and locally bundled rug photography
- Product collections, search, sorting and quick views
- Wishlist and shopping bag interactions
- Demo checkout and sample orders
- Admin dashboard, product listing management and order-status controls
- Demo tracking-reference fields and browser-local persistence

## Prototype limitations

This project is not yet a live store. Data is stored in the current browser using `localStorage`. It has no production database, WordPress/WooCommerce integration, real customer accounts, payment processing, tax calculation, shipping provider, courier tracking API, transactional email or production security.

Do not accept real payments or customer orders through this prototype.

## Before public launch

1. Connect WordPress + WooCommerce (or another production e-commerce backend).
2. Migrate the product catalogue and replace demo login with secure server-side authentication and role-based access.
3. Configure a payment provider that supports the merchant's business location and intended US sales.
4. Configure shipping, taxes, order emails, tracking, SEO, backups and security.
5. Test checkout and fulfillment end to end before accepting real orders.

The demo should remain in a **private GitHub repository** until the sample admin login has been removed or replaced with real authentication.
