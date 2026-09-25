# GELIN Commerce OS 4.0

Algerian ecommerce/business management system.

## Core
- Orders, customers, products and stock.
- Manual stock IN/OUT movements, product create/edit/delete.
- Courier configuration with Base URL, Bearer API token and custom Create URL.
- EcoTrack/Aranex-style dispatch.
- PostgreSQL persistence on Render.
- 58 Algerian wilayas.
- Backup endpoint.
- Audit log.

## Store integrations
The system exposes a per-store HTTPS webhook:
`POST /webhooks/orders/<integration-id>`

It accepts normalized ecommerce order payloads and common Shopify/WooCommerce-style fields, then creates the order in the central order system.

Supported connection patterns:
- Shopify: create an `orders/create` webhook pointing to the generated HTTPS URL.
- WooCommerce: create an order webhook with the generated URL and Secret.
- SetShop / YouCan / custom landing pages: send an HTTPS POST JSON request to the generated endpoint.
- Any custom ecommerce site: use the same endpoint.

Shopify webhooks are designed for near-real-time order synchronization. See the official Shopify webhook documentation: https://shopify.dev/docs/apps/build/webhooks

## Deployment
1. Push this repository to GitHub.
2. Open Render and create a Blueprint from the repository.
3. Render provisions the Node web service and PostgreSQL database from `render.yaml`.
4. After deployment, open the service URL.
5. Create a store integration and copy its Webhook URL + Secret into the store platform.

## Important
Courier APIs are not universal. EcoTrack/Aranex-style providers are handled directly; other couriers require their documented Create/Track/Label endpoints and payload mapping. Never put production API tokens in frontend code or GitHub.
