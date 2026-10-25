# Zua: shielded ZEC payments

Zua lets freelancers, creators and small shops get paid in **ZEC** with a
username, a payment link, an invoice or a widget on their own site. Every
payment is a **shielded Zcash transaction**: the blockchain records that
something happened, not who paid whom or how much. The wallet runs in the
browser; Zua's server never holds keys and never sees a payment.

Built for **ZECATHON**, Shielded Payments track.

## Features

**Get paid**

- **@username and payment links.** Public pages with a
  [ZIP-321](https://zips.z.cash/zip-0321) QR that any shielded Zcash wallet
  (Zodl, …) can pay. Payers need no Zua account.
- **Invoices that mark themselves paid.** Each invoice carries an encrypted
  memo tag (`zua:inv:<id>`). When the owner's wallet syncs and finds a
  payment with that tag, the invoice turns paid, partial payments included.
  Edit an invoice until it receives a payment (same link), or duplicate it
  with the next number. PDF export and a client receipt email.
- **Recurring and USD invoices.** Weekly or monthly invoices that issue
  themselves, with overdue reminders. Prices in USD, paid in ZEC at a rate
  locked for 30 minutes.
- **Point of sale.** A counter screen for shops: type the amount in ZEC or
  your currency, the customer scans a ZIP-321 QR, and the sale turns paid
  when the wallet finds its `zua:pos:<id>` memo (partial payments
  included). Keeps the screen awake, has a customer full-screen view, and a
  sales log with today's total and CSV export. The server never hears about
  a sale: the log lives in an encrypted record on the device.
- **Payment requests.** Ask another @username for a payment, end-to-end
  encrypted (the server stores ciphertext only).
- **On your own site.** A one-line "Pay with Zcash" widget, and a Checkout
  API with HMAC-signed webhooks for shops ([docs/api.md](docs/api.md)).

**Pay**

- **Send** to a @username, an address or a `zcash:` link, with a private
  memo. Proving (Halo 2) happens in the browser. Recent recipients (and
  names you give addresses) are kept only on the device; a @username is
  re-verified on every send.
- **Payroll.** Pay up to 50 people in one shielded transaction, from a form
  or a CSV, each with their own note.
- **Claim links.** Send ZEC to someone without a wallet as a link, after
  [ZIP 324](https://zips.z.cash/zip-0324) (draft). The key stays in the URL
  fragment; the sender can take the funds back until they are claimed.

**Prove**

- **Receipts proven on chain.** A receipt for a payment received, a payer's
  proof of payment, or a period **income statement** for an accountant. Each
  carries the note encryption keys of just those outputs; `/verify` decrypts
  them from the chain and checks the note commitments. Amounts and memos are
  proven; no viewing key, balance or other payment is revealed.

**Run your account**

- **Personal, freelancer or business.** Chosen at sign-up and changeable in
  Settings; it orders the navigation and the overview (a business sees the
  point of sale first). Nothing is locked: other tools stay one tap away.
- **Payment alerts.** A toast, an optional chime and an optional system
  notification the moment the wallet finds an incoming payment. The wallet
  finds it on the device, so the server never learns a payment arrived.
- **Your currency.** Amounts show an estimate in one of 24 currencies
  (defaulting from the browser's language, e.g. rupiah for `id-ID`).
  Payments are always in ZEC.
- **History** search by note, amount or transaction ID, filters by type and
  date, and a CSV export of what's shown.

**Privacy by construction**

- **No seed phrase.** Sign in with email or Google, protect the account with
  a passkey (PRF) or a 6-digit PIN. The Zcash wallet is derived from it in the
  browser; the 24 words can be exported to any Zcash wallet.
- **Verified usernames.** `@username → address` is signed with a key derived
  from the owner's passkey/PIN. Payers check it in their browser, so the
  server can't swap an address.
- **An address per invoice, link and checkout.** Diversified addresses, each
  signed by the owner: two payers can't tell they paid the same person.

## How it works

```
Browser                                          Server (Next.js + MongoDB)
├─ Passkey PRF / PIN escrow → account master     ├─ accounts, profiles (signed claims)
├─ HKDF → BIP39 seed, signing & messaging keys   ├─ paymentLinks, invoices, requests
├─ Wallet (Rust → WASM, webzjs/):                ├─ claimLinks, developer (API keys, webhooks)
│  ZIP-32 account, sync, Ironwood + Orchard,     ├─ REST /api/v1/checkouts, cron /api/cron/invoices
│  memos, Halo 2 proving, payment disclosure     └─ email notifications (opt-in)
├─ Encrypted wallet DB cache (IndexedDB)
└─ Reports "paid" for its own invoices/checkouts ──▶ webhooks to the merchant
        │ gRPC-web
        ▼
lightwalletd (ChainSafe proxy) → Zebra → Zcash (mainnet NU6.3 / testnet NU7)
```

**What the server knows:** your email, username, account type (and business
name, if you gave one) and public addresses; the invoices, links and
checkouts you create (amounts, client names); who requested payment from
whom (contents encrypted); and paid status and amount *as your own wallet
reports it*, never the paying transaction. **It never sees** your seed or
viewing keys, balance, history, who paid you or what you sent, your
point-of-sale sales or your contacts. There is deliberately no server-side
scanning: a checkout turns paid when your wallet, open in a browser, finds
the payment.

### Zcash under the hood

- **Network upgrades:** mainnet NU6.3 (Ironwood pool) and testnet NU7, from
  one WASM build. Upstream WebZjs stops at NU6.1, whose transactions mainnet
  now rejects, so we ported it to the current librustzcash crates
  (`zcash_client_backend`, `zcash_client_sqlite` on SQLite compiled to WASM).
- **ZIPs:** 321 (payment URIs), 316 (unified addresses), 32 (HD keys), 317
  (fees), 302 (memos), 212/2005 (Orchard v2 / Ironwood v3 note plaintexts),
  318 (pool migration, via the library), 324 (inspiration for claim links).
- **Payment disclosure** (`webzjs/crates/webzjs-wallet/src/disclosure.rs`):
  the recipient reveals K_enc = KDF(KA.Agree(ivk, epk), epk) for one output;
  the sender can recover the same key from its outgoing viewing key. The
  verifier decrypts that output with ChaCha20-Poly1305, rebuilds the note
  and checks it against `cmx` on chain.

## Repository

| Path | What |
|---|---|
| `web/` | Next.js 15 app (React 19, tRPC 11, MongoDB, Privy for login only) |
| `web/src/lib/zcash/` | wallet wrapper, ZIP-321, memo tags, units, seed derivation, encrypted cache |
| `web/src/lib/` | `profileClaim.ts` and `addressClaim.ts` (signed username/address claims), `sealedBox.ts` |
| `web/src/features/` | receipts (v3 + verifier), invoices (recurrence, USD money), point of sale, contacts, payment alerts, claim links, payroll CSV, embed |
| `web/src/server/modules/` | `accounts`, `profiles`, `paymentLinks`, `invoices`, `requests`, `claimLinks`, `developer`, `notifications` |
| `web/public/embed.js` | the "Pay with Zcash" widget (no build step) |
| `webzjs/` | the wallet's Rust source: our fork of [ChainSafe WebZjs](https://github.com/ChainSafe/WebZjs) (MIT/Apache-2.0, history kept) |
| `packages/webzjs-wallet/` | prebuilt WASM of `webzjs/`, so the app runs without a Rust toolchain |
| `docs/` | [`setup.md`](docs/setup.md) (setup, testnet, test checklist), [`api.md`](docs/api.md) (widget, API, webhooks), `superpowers/` (design spec) |

## Run locally

Full walkthrough, including free testnet coins and an end-to-end checklist:
[`docs/setup.md`](docs/setup.md).

Requirements: Node 22+, pnpm 10, MongoDB (local or Atlas), a Privy app with
`http://localhost:3000` in its allowed origins.

```sh
pnpm install
cp web/.env.example web/.env.local   # Privy, MongoDB; NEXT_PUBLIC_ZCASH_NETWORK=test for free TAZ
pnpm --filter web migrate:up
pnpm dev                             # http://localhost:3000
```

Use small amounts on mainnet: the wallet library is unaudited.

## Tests

```sh
pnpm --filter web test        # unit tests (Vitest)
pnpm wallet:test              # native Rust tests: payment disclosure, sender recovery
```

Integration tests (recurring and USD invoices, Checkout API, signed webhooks)
run against a local MongoDB in throwaway databases:

```sh
mongod --dbpath /tmp/zua-mongo --port 27047 --fork --logpath /tmp/zua-mongo.log
ZUA_TEST_MONGODB_URI=mongodb://127.0.0.1:27047 pnpm --filter web test
```

`pnpm --filter web biome:check`, `pnpm lint` and
`pnpm --filter web exec tsc --noEmit` keep style, lint and types clean.
`web/scripts/webhook-receiver.mjs` prints and verifies webhooks locally.

## Rebuilding the wallet

```sh
brew install wasm-pack just llvm
cargo +stable install wasm-bindgen-cli --version 0.2.129 --locked
pnpm wallet:build   # webzjs/ → packages/webzjs-wallet → web/public/webzjs
```

The build is reproducible: rebuilding gives the committed WASM byte for byte.
`pnpm dev` / `pnpm build` copy the package to `web/public/webzjs`
(`web/scripts/sync-webzjs.mjs`), where the browser loads it as native ES
modules so its thread workers resolve.

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_ZCASH_NETWORK` | `main` or `test` |
| `NEXT_PUBLIC_LIGHTWALLETD_URL` | optional; gRPC-web proxy (defaults to ChainSafe's for the network) |
| `NEXT_PUBLIC_ZCASH_EXPLORER_TX_URL` | optional, `{txid}` is replaced (defaults to zcashexplorer.app) |
| `NEXT_PUBLIC_MIN_CONFIRMATIONS` | confirmations before funds are spendable (default 3) |
| `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | login |
| `MONGODB_URI` | include a database name, e.g. `/zua` |
| `CRON_SECRET` | protects `/api/cron/invoices` (recurring invoices, reminders) |
| `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` | optional email; `APP_URL` also builds API and webhook links |

## Limits and honest caveats

- The wallet library and lightwalletd access are unaudited, and the Zcash
  crates are pre-releases: treat Zua as experimental.
- "Paid" (invoices, checkouts, webhooks) is reported by the owner's wallet;
  the server can't verify shielded payments by design, and confirmations
  arrive while the owner's dashboard is open. Payment alerts likewise need
  Zua open in a tab.
- The wallet sees a payment once it is mined (a block is ~75 seconds), not
  while it waits in the mempool, so a point-of-sale sale usually turns paid
  a minute or two after the customer sends it.
- Sales and contacts live in an encrypted record in this browser only:
  another device doesn't see them, and clearing site data removes them
  (export the sales CSV first). Amounts in your currency are estimates from
  CoinGecko.
- Cashing out to a transparent address (an exchange) makes that payment
  public; the app warns first. Payers sending from transparent addresses
  reveal their side.
- A payer's proof of payment proves the payment on chain; that the signer is
  the payer is their signed statement (the recipient knows the same key).
- Claim links are bearer links: anyone who sees one can claim it. Their
  format is Zua's own (ZIP 324 is a Sapling-era draft).
- The ZIP-317 fee shown before a simple send is an estimate; the wallet
  computes the exact fee (batch payments show it before you confirm).

## License

The app is unlicensed for now. `webzjs/` keeps ChainSafe's MIT/Apache-2.0
licenses (`webzjs/LICENSE-MIT`, `webzjs/LICENSE-APACHE`).
