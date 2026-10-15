# Accepting shielded ZEC on your site

Two ways to take payments outside the Zua dashboard. Both keep payments
**shielded**: they go straight from the payer's Zcash wallet to an address
you signed. Neither your site nor Zua's server ever sees the payment.

- **Website widget**: one `<script>` tag, no server code. For tips, donations,
  simple products.
- **Checkout API**: your server creates a checkout per order and gets a signed
  webhook once it is paid. For shops.

## How "paid" is known, and how fast

Zua's server can't see shielded payments, by design. A checkout becomes
`paid` when **your** Zua wallet finds the payment (by its memo tag) and
reports it. That happens whenever the Zua dashboard is open and syncing
(every 30 s). Then the `checkout.paid` webhook fires.

So confirmations arrive while a Zua tab is open on your side (a shop PC, a
phone). There is no "watch-only" mode that would let the server scan your
payments: keeping it that way is the point.

## Website widget

```html
<script src="https://YOUR-ZUA/embed.js" async
        data-to="@yourname" data-link="coffee"></script>
```

| Attribute | Meaning |
|---|---|
| `data-to` | `@username` to pay (required unless `data-invoice`) |
| `data-link` | one of your payment links (fixed amount, its own address) |
| `data-amount` | suggested ZEC amount for open-amount pages |
| `data-invoice` | a public invoice or checkout token, instead of `data-to` |
| `data-mode` | `button` (default, opens a dialog) or `inline` |
| `data-label` | button text |
| `data-theme` | `light` or `dark` |

Several widgets on one page: put the attributes on any element with
`data-zua-pay` and load `embed.js` once.

Events bubble to `document` as `CustomEvent`s:

| Event | When |
|---|---|
| `zua:ready` | the widget loaded |
| `zua:payer-says-paid` | the payer pressed "I've paid" (a claim, not a confirmation) |
| `zua:paid` | an invoice/checkout was confirmed paid by your wallet (`detail.invoice`) |
| `zua:close` | the dialog closed |

Get the code from **Links → code icon** or **Settings → Website widget**.
`/embed-demo.html?to=yourname` shows it on a sample shop page.

## Checkout API

Create a key in **Developers → API keys**. Send it as
`Authorization: Bearer zua_sk_…` from your server only.

### Create a checkout

`POST /api/v1/checkouts`

```json
{
  "amount": "25.00",
  "currency": "USD",
  "reference": "order_1042",
  "description": "Coffee x2",
  "customer_name": "Ada",
  "customer_email": "ada@example.com",
  "due_date": "2026-11-01"
}
```

Only `amount` is required. `currency` is `ZEC` (default, up to 8 decimals) or
`USD` (2 decimals, paid in ZEC at a rate locked for 30 minutes when the buyer
opens it). Returns `201` with a checkout:

```json
{
  "id": "Q7…",
  "object": "checkout",
  "status": "open",
  "currency": "USD",
  "amount": "25.00",
  "amount_zat": null,
  "paid_zat": "0",
  "reference": "order_1042",
  "description": "Coffee x2",
  "url": "https://YOUR-ZUA/i/…",
  "embed_url": "https://YOUR-ZUA/embed/i/…",
  "created_at": "2026-10-15T10:00:00.000Z",
  "paid_reported_at": null
}
```

Send the buyer to `url`, or show it on your page with the widget
(`data-invoice` = the token at the end of `url`) or an iframe of `embed_url`.
Each checkout gets its own unlinkable address from a pool your wallet signs
ahead (see **Developers → Address pool**).

### Get a checkout

`GET /api/v1/checkouts/:id` returns the same object. `status` is `open`,
`partially_paid`, `paid` or `void`. `amount_zat` is the ZEC due (for USD, the
locked quote; `null` until a buyer opens it).

### Errors

`{ "error": { "code": "invalid_request", "message": "…" } }` with `400`,
`401` (missing or revoked key), `404` or `429` (more than 120 requests a
minute per key).

## Webhooks

Set an endpoint in **Developers → Webhook** (`https://`; `http://localhost`
works in development). Events are POSTed as JSON:

```json
{
  "id": "evt_…",
  "type": "checkout.paid",
  "created": 1792000000,
  "data": { "id": "Q7…", "object": "checkout", "status": "paid", "reference": "order_1042", "…": "…" }
}
```

Types: `checkout.paid` (API checkouts), `invoice.paid` (dashboard invoices)
and `test`. A failed delivery is retried twice (after 2 s and 8 s); the last
20 deliveries are listed in the dashboard.

Every request has a `Zua-Signature: t=<unix seconds>,v1=<hex>` header, where
`v1 = HMAC-SHA256(secret, "<t>.<raw body>")`. Verify it before trusting the
event, and reject timestamps more than 5 minutes old:

```js
import { createHmac, timingSafeEqual } from "node:crypto";

function verify(secret, rawBody, header) {
  const { t, v1 } = Object.fromEntries(header.split(",").map((p) => p.split("=")));
  if (Math.abs(Date.now() / 1000 - Number(t)) > 300) return false;
  const expected = createHmac("sha256", secret).update(`${t}.${rawBody}`).digest("hex");
  return v1?.length === expected.length &&
    timingSafeEqual(Buffer.from(v1), Buffer.from(expected));
}
```

Treat events as at-least-once: use `data.id` or `data.reference` to ignore
duplicates.
