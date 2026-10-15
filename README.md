# Zua: shielded ZEC payments

Zua lets freelancers and small businesses get paid in **ZEC** with a username,
a payment link or an invoice. Every payment is a **shielded Zcash
transaction**: the blockchain records that something happened, not who paid
whom or how much.

- **No seed phrase.** Sign in with email or Google, protect the account with a
  passkey (or a 6-digit PIN). The Zcash wallet is derived from it on each
  device and lives in browser memory only.
- **Any Zcash wallet can pay.** Links and invoices are standard
  [ZIP-321](https://zips.z.cash/zip-0321) payment requests, so clients scan a QR
  code with Zodl or any shielded wallet. No Zua account needed.
- **Invoices mark themselves paid.** Each invoice carries an encrypted memo tag
  (`zua:inv:<id>`). When the owner's wallet syncs and finds a payment with that
  tag, the invoice turns paid, partial payments included. The server never sees
  the payment.
- **Verified usernames.** `@username → address` is a claim signed with a key
  derived from the owner's passkey/PIN. Payers check the signature in their
  browser before a QR code is shown, so the server can't swap an address.
- **An address per invoice and link.** Each invoice and payment link gets its
  own diversified address, signed by the owner. Two clients can't tell they
  paid the same person.
- **Receipts proven on chain.** A receipt (or a payer's proof of payment, or
  a period statement for an accountant) carries the note keys of just those
  outputs. `/verify` decrypts them from the chain and checks the commitments:
  amounts and memos are proven, nothing else is opened.
- **Payroll.** Pay up to 50 people in one shielded transaction, from a form or
  a CSV, each with a private note.
- **Recurring and USD invoices.** Weekly or monthly invoices that issue
  themselves with email reminders; prices in USD paid in ZEC at a rate locked
  for 30 minutes.
- **On your own site.** A one-line "Pay with Zcash" widget, and a Checkout
  API with signed webhooks for shops ([docs/api.md](docs/api.md)). Still
  shielded: a checkout turns paid when your own wallet reports it.
- **Claim links.** Send ZEC to someone without an address as a link (after
  ZIP 324, draft). The key stays in the URL fragment; the sender can take the
  funds back until they're claimed.

Built for **ZECATHON** (Shielded Payments track).

## How it works

```
Browser                                        Server (Next.js + MongoDB)
├─ Passkey PRF / PIN escrow → account master   ├─ accounts: PIN escrow, passkey record
├─ HKDF → BIP39 seed (24 words, memory only)   ├─ profiles: @username → UA + signed claim
├─ WebZjs (WASM): ZIP-32 account, sync,        ├─ paymentLinks, invoices (no payment data)
│  balance, memos, Halo 2 proving, send        └─ notifications (email, opt-in)
└─ Encrypted wallet DB cache (IndexedDB)
        │ gRPC-web
        ▼
lightwalletd (ChainSafe proxy) → zebrad → Zcash mainnet
```

What the server knows: your email, username, public address, the links and
invoices you create, and invoice status as reported by your own wallet. It never
sees your seed, viewing keys, balance, history, senders or amounts.

## Repository

- `web/` - Next.js 15 app (React 19, tRPC 11, MongoDB, Privy for login).
  - `src/lib/zcash/` - wallet wrapper (WebZjs), ZIP-321, memo tags, units,
    address checks, seed derivation, encrypted wallet cache.
  - `src/lib/profileClaim.ts` - signed username → address claims.
  - `src/server/modules/` - `accounts`, `profiles`, `paymentLinks`, `invoices`,
    `notifications`.
- `packages/webzjs-wallet/` - prebuilt wallet (WASM) from our fork of
  [ChainSafe WebZjs](https://github.com/ChainSafe/WebZjs), ported to the
  current Zcash crates (mainnet NU6.3, testnet NU7): it scans and spends the **Ironwood** pool,
  stores the wallet in `zcash_client_sqlite` on SQLite compiled to WASM, sends
  memos, and discloses single payments for receipts.
- `docs/superpowers/` - migration plan and design spec.

## Run locally

Full walkthrough, including free testnet coins and a test checklist:
[`docs/setup.md`](docs/setup.md).

Requirements: Node 22+, pnpm 10, MongoDB (local or Atlas), a Privy app with
`http://localhost:3000` in its allowed origins.

```sh
pnpm install
cp web/.env.example web/.env.local   # fill in Privy + MongoDB
pnpm --filter web migrate:up
pnpm dev                             # http://localhost:3000
pnpm --filter web test
```

`NEXT_PUBLIC_ZCASH_NETWORK=main` works out of the box. For free testing set
`NEXT_PUBLIC_ZCASH_NETWORK=test` (testnet, NU7) and get TAZ from a testnet
faucet; the lightwalletd proxy and explorer default to the chosen network. Use
small amounts on mainnet: the wallet library is unaudited.

### Rebuilding the wallet package

Upstream WebZjs stops at NU6.1, so transactions it builds are rejected on
today's mainnet. Our port lives on the `zua/nu63` branch of the WebZjs fork:

```sh
cd WebZjs && git checkout zua/nu7
brew install wasm-pack just llvm
cargo +stable install wasm-bindgen-cli --version 0.2.129 --locked
PATH=$(brew --prefix llvm)/bin:$PATH \
CC_wasm32_unknown_unknown=$(brew --prefix llvm)/bin/clang \
AR_wasm32_unknown_unknown=$(brew --prefix llvm)/bin/llvm-ar \
  just build-wallet
cp -R packages/webzjs-wallet ../zua/packages/
```

`pnpm dev` / `pnpm build` copy the package to `web/public/webzjs`
(`web/scripts/sync-webzjs.mjs`); the browser loads it as native ES modules so
its thread workers resolve.

## Environment

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_ZCASH_NETWORK` | `main` or `test` |
| `NEXT_PUBLIC_LIGHTWALLETD_URL` | optional; gRPC-web proxy (defaults to ChainSafe's for the network) |
| `NEXT_PUBLIC_ZCASH_EXPLORER_TX_URL` | optional, `{txid}` is replaced (defaults to zcashexplorer.app) |
| `NEXT_PUBLIC_MIN_CONFIRMATIONS` | confirmations before funds are spendable (default 3) |
| `NEXT_PUBLIC_PRIVY_APP_ID`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET` | login |
| `MONGODB_URI` | include a database name, e.g. `/zcash-app` |
| `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` | optional email notifications |

## Limits and honest caveats

- WebZjs and lightwalletd access are unaudited; treat Zua as experimental.
- Invoice "paid" status is reported by the owner's wallet; the server cannot
  verify shielded payments by design.
- Cashing out to a transparent address (an exchange) makes that payment public;
  the app warns before it does.
- The ZIP-317 fee shown before sending is an estimate; the wallet computes the
  exact fee.
- What the server knows (metadata): usernames, the invoices and links you
  create (amounts, client names), who requested payment from whom (request
  contents are end-to-end encrypted) and paid status as your wallet reports
  it. It never sees balances, history or who actually paid.
- A payer's "proof of payment" proves the payment on chain; that the signer
  is the payer is their signed statement (the recipient knows the same note
  key).
- Claim links are bearer links: anyone who sees one can claim it. Their format
  is Zua's own (ZIP 324 is a Sapling-era draft).
