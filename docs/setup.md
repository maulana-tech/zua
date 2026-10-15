# Setup and testing

How to run Zua locally and test every payment flow for free on Zcash testnet,
then switch to mainnet.

## 1. Requirements

- Node 22+ and pnpm 10
- MongoDB: local, or a free MongoDB Atlas cluster
- A [Privy](https://dashboard.privy.io) app (login only)
- Chrome or another Chromium browser. The wallet needs `SharedArrayBuffer`,
  which works on `localhost` and HTTPS with the cross-origin isolation headers
  Zua already sends.
- Optional: a [Resend](https://resend.com) API key for email notifications

## 2. Install

```sh
pnpm install
cp web/.env.example web/.env.local
```

`pnpm dev` and `pnpm build` copy the wallet (`packages/webzjs-wallet`, about
60 MB of WASM) to `web/public/webzjs`. You never need to edit that folder.

## 3. Configure `web/.env.local`

### Zcash network

| Variable | Testnet (free testing) | Mainnet (real ZEC) |
|---|---|---|
| `NEXT_PUBLIC_ZCASH_NETWORK` | `test` | `main` |
| `NEXT_PUBLIC_LIGHTWALLETD_URL` | leave empty | leave empty |
| `NEXT_PUBLIC_ZCASH_EXPLORER_TX_URL` | leave empty | leave empty |
| `NEXT_PUBLIC_MIN_CONFIRMATIONS` | `1` (faster tests) | `3` |

If the two URLs are left empty, they default to ChainSafe's gRPC-web
lightwalletd proxy and zcashexplorer.app for the chosen network. Testnet runs
NU7 and mainnet runs NU6.3 (Ironwood). The same wallet build supports both.

### Privy

1. Create an app in the Privy dashboard and enable **Email** and **Google**
   (passkey login is optional).
2. Turn off embedded wallets. Zua derives its own Zcash keys.
3. Under **Configuration → App settings → Allowed origins**, add
   `http://localhost:3000`. If you skip this, the console shows
   `Origin not allowed` and sign-in does nothing.
4. Copy the app ID into `NEXT_PUBLIC_PRIVY_APP_ID` and `PRIVY_APP_ID`, and the
   secret into `PRIVY_APP_SECRET`.

### MongoDB

Set `MONGODB_URI`. It must include a database name, for example
`mongodb+srv://user:pass@cluster.mongodb.net/zua`. Without one, the driver
writes to a database called `test`.

Then create the collections and indexes:

```sh
pnpm --filter web migrate:up
```

### Optional

- `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL`: emails for paid invoices, payment
  pings and new requests, plus the paid-invoice receipt email to clients.
- `CRON_SECRET`: protects `GET /api/cron/invoices`, which issues the next
  invoice of recurring series and emails overdue reminders. Call it hourly
  with `Authorization: Bearer $CRON_SECRET` (for example a Vercel cron or
  `curl` from any scheduler). Without it, a series still catches up whenever
  its owner opens Invoices.

## 4. Run

```sh
pnpm dev      # http://localhost:3000
```

Open `http://localhost:3000`, sign in, and pick an unlock method: a passkey,
or a 6-digit PIN if your device has no PRF passkey. Then claim a `@username`.
Your wallet is created in the browser and syncs from about 100 blocks before
now. A "Testnet" badge in the header shows which network you are on.

## 5. Get free testnet coins (TAZ)

1. In Zua, open **Settings → Zcash wallet** (or **Receive**) and copy your
   address. On testnet it starts with `utest1`.
2. Go to the [Zcash testnet faucet](https://zcashfaucet.jinolabs.xyz/), paste
   the address and solve the short in-browser puzzle. You get 0.1 TAZ, sent
   shielded, once per address every 24 hours.
3. Wait for the transaction to be mined (about 75 s per block). Your balance
   shows it as pending first, then spendable after
   `NEXT_PUBLIC_MIN_CONFIRMATIONS` blocks.

0.1 TAZ covers dozens of test payments, since a payment's fee is about
0.0001–0.00015 ZEC (ZIP-317). For more, ask in the Zcash community Discord or
wait 24 h. To test payments between two people, use a second browser profile
with a second account.

## 6. Test checklist

Use two accounts, A (the freelancer) and B (the payer), in two browser
profiles. Both need TAZ for steps that send.

| # | Flow | Steps | Expected |
|---|---|---|---|
| 1 | Wallet | Sign in as A, unlock, wait for sync | Address shown, balance after the faucet, "Testnet" badge |
| 2 | Backup | Settings → reveal recovery words | 24 words. Importing them in a testnet-capable wallet shows the same funds. |
| 3 | Payment link | A: Links → create a link (amount optional) → open `/pay/<username>` | QR + ZIP-321 URI, "verified profile" check passes |
| 4 | Send | B: Send → `@A` or A's `utest1…`, an amount, a memo → confirm | Proving takes about 10–30 s, then a txid. A sees the payment with the memo after sync. |
| 5 | Invoice | A: Invoices → new invoice → open its public link. B presses **Copy payment link** there and pastes it into Send (the link carries the amount and the invoice memo), or scans the QR with another wallet. | Once A's wallet syncs, the invoice turns **Paid** without anyone pressing a button, and the client email goes out if Resend is set. |
| 6 | Partial payment | Pay an invoice with less than the total | Shows partially paid with the amount received |
| 7 | Request | A: Requests → request from `@B` | B sees the request (end-to-end encrypted) and pays it. It turns paid for both. |
| 8 | Receipt | A: History → receipt icon on the received payment | Downloads `zua-receipt-….json` |
| 9 | Verify | Open `/verify`, choose the receipt | "Verified on Zcash": amount and memo **proven on chain**, recipient signature checked |
| 10 | Tamper | Edit the amount in the receipt JSON and verify again | Rejected |
| 11 | Restore | Reload the page and unlock again | Fast start from the encrypted local cache, same balance |
| 12 | Address per invoice | Create two invoices, open both public pages | Different `utest1…` addresses, both "signed by @A"; payments to either show in A's history |
| 13 | Proof of payment | B: History → icon on the sent payment → open it in `/verify` | "Proof of payment", paid to @A, amount proven |
| 14 | Statement | A: History → Income statement → this month → Download, then `/verify` it | Total of all payments in the period, each proven; CSV export matches |
| 15 | Payroll | B: Payroll → two rows (@A and another address) → Review → Pay | One transaction; fee shown before paying; each recipient sees only their row's note |
| 16 | Recurring | A: new invoice, Repeat monthly. Trigger `GET /api/cron/invoices` (Bearer `CRON_SECRET`) after editing `nextIssueAt` in Mongo to the past, or wait | A new invoice `<number>-2` appears; client emailed if Resend is set |
| 17 | USD invoice | A: new invoice priced in USD → open the public page | ZEC amount locked for 30 minutes at the shown rate; paying it marks the invoice paid |
| 18 | Claim link | B: Claim links → 0.01 → Create → open the link in another profile → Claim to @A | After confirmations the link shows "ready"; claiming sweeps it to A; B's "Check status" shows Claimed. Try "Take back" on another link. |

Explorer: `https://testnet.zcashexplorer.app/transactions/<txid>` shows the
transaction is on chain. Shielded amounts and addresses are not visible there.

### 6.1 Automated tests

```sh
cd web
pnpm test        # unit tests; MongoDB integration tests skip themselves
```

The integration tests (recurring and USD invoices, Checkout API, webhooks)
run against a local MongoDB in throwaway `zua_test_…` databases, never the
configured one:

```sh
mkdir -p /tmp/zua-mongo
mongod --dbpath /tmp/zua-mongo --port 27047 --fork --logpath /tmp/zua-mongo.log
ZUA_TEST_MONGODB_URI=mongodb://127.0.0.1:27047 pnpm test
```

### 6.2 Website widget

1. As A, create a payment link (e.g. slug `coffee`, 0.01 ZEC).
2. Open `http://localhost:3000/embed-demo.html?to=<A>&link=coffee` (or the
   `</>` icon on the link → **Try it on a demo page**).
3. Click **Pay with Zcash**: the dialog shows A's signed QR and the event log
   on the page shows `zua:ready`. Esc closes it (`zua:close`).
4. To test from another origin, as a real shop would:

   ```sh
   mkdir -p /tmp/shop
   sed 's|src="/embed.js"|src="http://localhost:3000/embed.js"|' web/public/embed-demo.html > /tmp/shop/index.html
   (cd /tmp/shop && python3 -m http.server 8765)
   ```

   Then open `http://127.0.0.1:8765/?to=<A>&link=coffee`.
5. Pay from B's wallet. With A's dashboard open, the payment shows up in A's
   History after a sync.

### 6.3 Checkout API and webhooks

1. As A, open **Developers**:
   - Create an API key and copy it (shown once).
   - Set the webhook URL to `http://localhost:4000/hook`, save, then reveal
     and copy the signing secret.
   - Check that the address pool shows 10 of 10 ready (**Refill now** if
     not).
2. Start the local receiver, which prints each event and checks its
   signature:

   ```sh
   node web/scripts/webhook-receiver.mjs whsec_… 4000
   ```

3. **Send test event** in Developers: the receiver prints `VALID  test`.
4. Create a checkout:

   ```sh
   curl -s http://localhost:3000/api/v1/checkouts \
     -H "Authorization: Bearer zua_sk_…" -H "Content-Type: application/json" \
     -d '{"amount":"0.01","reference":"order_1","description":"Coffee"}'
   ```

5. Open the returned `url` (or embed it with `data-invoice=<token>`), press
   **Copy payment link** and pay it from B's Send page.
6. Keep A's dashboard open. Once the payment confirms (about 75 s on testnet
   with `NEXT_PUBLIC_MIN_CONFIRMATIONS=1`), A's wallet reports it and the
   receiver prints `VALID  checkout.paid` with `"reference": "order_1"`.
7. Check it from the API:

   ```sh
   curl -s http://localhost:3000/api/v1/checkouts/<id> -H "Authorization: Bearer zua_sk_…"
   ```

   Expect `"status": "paid"`.

Also check the failure cases:

| Try | Expected |
|---|---|
| No key, or a revoked key | `401` |
| `{"amount":"1.234","currency":"USD"}` | `400 invalid_amount` |
| A USD checkout | `amount_zat` is `null` until the checkout page is opened, then the locked quote |
| Paying less than the total | `"status": "partially_paid"` |
| Receiver stopped, then **Send test event** | Delivery listed as failed after 3 tries |

See [api.md](api.md) for the full API and widget reference.

## 7. Switch to mainnet

1. Set `NEXT_PUBLIC_ZCASH_NETWORK=main` and `NEXT_PUBLIC_MIN_CONFIRMATIONS=3`,
   then restart `pnpm dev`.
2. Each account now has a separate mainnet wallet with a different address
   (`u1…`) and its own balance.
3. Fund it with a small amount from [Zodl](https://zodl.com) or an exchange.
   0.005 ZEC is enough for several tests. The wallet library is unaudited, so
   keep amounts small.

## 8. Troubleshooting

| Symptom | Fix |
|---|---|
| `Origin not allowed` in the console, sign-in does nothing | Add the exact origin (`http://localhost:3000`, or your deploy URL) to Privy's Allowed origins, on the same app as `NEXT_PUBLIC_PRIVY_APP_ID`. |
| Wallet stuck loading | Hard reload. The first load downloads and compiles 60 MB of WASM. Check that `self.crossOriginIsolated` is `true` in the console on a dashboard page. |
| `404` for `/webzjs/webzjs_wallet.js` | Run `node web/scripts/sync-webzjs.mjs` (or restart `pnpm dev`). |
| `invalid consensus branch id` | The network ran an upgrade the wallet build does not know. Rebuild the wallet (README, "Rebuilding the wallet package") from current librustzcash crates. |
| Balance stays pending | Wait for `NEXT_PUBLIC_MIN_CONFIRMATIONS` blocks (about 75 s each). |
| Faucet says already claimed | One claim per address per 24 h. Use the second account's address. |
| Migrations wrote to a `test` database | `MONGODB_URI` has no database name. Add one and run `migrate:up` again. |

## 9. Run on another computer

Git carries the code and the prebuilt wallet (`packages/webzjs-wallet`), so
another machine needs no Rust toolchain. It does **not** carry
`web/.env.local`, which holds secrets (Privy secret, MongoDB password). Copy
that file yourself, for example through a password manager or AirDrop. Never
commit it, and don't paste it into chat or email.

### 9.1 Get the code

The branch with this work is `zecathon`. Pick one way to move it.

**A. Through a private GitHub repo (recommended)**

On the machine that has the code:

```sh
git remote add origin git@github.com:<you>/zua.git   # create the repo as private first
git push -u origin zecathon
```

On the new laptop:

```sh
git clone git@github.com:<you>/zua.git
cd zua && git checkout zecathon
```

**B. Without GitHub (one file over AirDrop or USB)**

```sh
# on the machine that has the code
git bundle create ~/Desktop/zua.bundle --all
# on the new laptop
git clone ~/Downloads/zua.bundle zua
cd zua && git checkout zecathon
```

The bundle is about 260 MB, mostly old wallet builds in the history.

### 9.2 Install tools

- Node 22 or newer: `brew install node`, or use nvm. Check with `node -v`.
- pnpm 10: `corepack enable` (the repo pins `pnpm@10.4.1` in
  `package.json`), or `npm i -g pnpm@10`.
- Chrome.

### 9.3 Configure and run

```sh
pnpm install
cp /path/to/your/.env.local web/.env.local   # the file copied from the other machine
pnpm dev                                     # http://localhost:3000
```

Then check three things:

1. **MongoDB Atlas network access.** Atlas only accepts allowed IPs. In Atlas,
   go to **Network Access** and add the laptop's IP (or `0.0.0.0/0` for
   development only). Otherwise the server logs a connection timeout and
   sign-in fails. If you point at the same database, you don't need to run
   migrations again. `pnpm --filter web migrate:up` is safe to re-run anyway.
2. **Privy origin.** `http://localhost:3000` is the same origin on every
   machine, so nothing changes. If `pnpm dev` starts on another port because
   3000 is taken, either free the port or add that origin in Privy.
3. **Network.** Keep `NEXT_PUBLIC_ZCASH_NETWORK` the same on both machines if
   you want to see the same wallet. Testnet and mainnet wallets are different.

### 9.4 Your account on the new laptop

Sign in with the same Privy login (email or Google). Unlock with your passkey
or PIN, and the same Zcash wallet is derived again, because keys come from the
passkey or PIN, not from the device.

- **PIN:** works on any device. The encrypted escrow lives on the server.
- **Passkey:** works if the passkey syncs to the new device (iCloud Keychain,
  Google Password Manager). A passkey bound to one device won't be there, so
  use your PIN or the 24 recovery words instead.

The encrypted wallet cache stays in each browser, so the first unlock on a new
laptop scans the chain again from the account's birthday. That takes a few
minutes for an old account.

### 9.5 Rebuilding the wallet (optional)

You only need this if you change the Rust wallet in `webzjs/` (it comes with
the clone). Install Rust, wasm-pack, just, LLVM and wasm-bindgen-cli 0.2.129,
then run `pnpm wallet:build`; see the README section "Rebuilding the wallet
package".
