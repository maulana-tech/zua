# Migrasi Total Meaw ke Zcash (ZECATHON)

Disusun: 14 Oktober 2026
Target: submission ZECATHON, track **Shielded Payments**
Deadline (perlu dikonfirmasi di halaman Rules setelah login): **28 Oktober 2026**

## 0. Ringkasan

Meaw sekarang adalah app pembayaran privat di **Monad** dengan shielded pool buatan
sendiri (kontrak `MaweePool`, circuit Groth16, relayer gasless, indexer Envio).
ZECATHON mensyaratkan proyek yang **dibangun di atas Zcash**, jadi mesinnya kita
ganti total:

| Lapisan | Sekarang (Monad) | Sesudah (Zcash) |
|---|---|---|
| Shielded pool | `MaweePool` + Merkle tree sendiri | Pool **Orchard** Zcash |
| Bukti ZK | Circuit Groth16 sendiri (`monad-zk/`, `public/zk`) | Halo 2 Orchard, dibuat di browser oleh WebZjs |
| Alamat penerima | Note pubkey + view pubkey di `MaweeRegistry` | **Unified Address** (penerima Orchard) |
| Payment link | Halaman bayar dengan wallet EVM | **URI ZIP-321** (QR dan link) yang bisa dibayar wallet Zcash mana pun, misalnya Zodl |
| Scan saldo | Mirror `Deposit` (Mongo/Envio) + dekripsi di browser | **Sync lightwalletd** + trial decryption di browser (WebZjs) |
| Gas | Relayer MON | Fee ZEC kecil (ZIP-317) dibayar dari saldo user, jadi relayer tidak perlu |
| Kunci | Passkey PRF → HKDF → note/view key | Passkey PRF → HKDF → **seed BIP39** → ZIP-32 USK/UFVK |
| Bukti untuk akuntan | Receipt JSON + Merkle proof + anchor block | Receipt: txid + memo + bukti dekripsi (lihat §6.6) |

Yang **dipertahankan**: seluruh UX dan UI Meaw (dashboard, payment link, invoice,
request, maskot, PWA, email), username, login Privy, passkey/PIN, MongoDB untuk
data non-finansial.

## 1. Hal yang harus dipastikan dulu

- [ ] Login ke thezecathon.com, lalu baca **Rules** dan **Schedule**:
  - Boleh melanjutkan proyek lama, atau harus kode baru selama masa build?
  - Wajib mainnet atau testnet? Ada syarat open source, video, atau demo live?
  - Isi detail track Shielded Payments dan community bounties.
- [ ] Kalau proyek lama **tidak boleh**: buat **repo baru** (remote lama sudah
  dilepas dari repo ini) dan salin hanya modul UI yang kita tulis sendiri.
  Sebutkan dengan jujur di submission bagian mana yang berasal dari Meaw.
- [ ] Pilih jaringan. Rekomendasi: **mainnet dengan nominal sangat kecil**,
  karena proxy gRPC-web publik baru tersedia untuk mainnet
  (`https://zcash-mainnet.chainsafe.dev`). Proxy dan faucet testnet publik tidak
  ditemukan.

## 2. Arsitektur sesudah migrasi

```
Browser (Next.js, client-side crypto)
 ├─ Passkey PRF / PIN escrow ──► master (sudah ada: lib/passkey.ts, lib/keys.ts)
 ├─ HKDF("meaw.zcash.seed.v1") ─► entropy 32 byte ─► mnemonic BIP39 24 kata (hanya di memori)
 ├─ WebZjs (WASM, web worker)
 │    ├─ create_account(seed, hdIndex=0, birthday)
 │    ├─ sync() via lightwalletd gRPC-web proxy
 │    ├─ saldo, note, memo masuk
 │    └─ propose → prove (Halo 2) → kirim transaksi Orchard
 └─ UI Meaw (dashboard, invoice, link, request)

Server (Next.js + tRPC + MongoDB), tidak pernah memegang kunci
 ├─ usernames: @user ─► unified address + birthday height (publik)
 ├─ paymentLinks / invoices: metadata + status yang dilaporkan pemilik
 ├─ notifications: email (Resend) dari ping payer/pemilik
 └─ (opsional) proxy NEAR Intents 1Click untuk pembayaran lintas chain

Jaringan Zcash
 └─ lightwalletd (+ proxy gRPC-web) ─► zebrad
```

**Prinsip privasi yang sama dengan sekarang:** secret dan note hanya ada di memori
halaman. Server tidak pernah menerima seed, USK, UFVK atau viewing key.

## 3. Library dan infrastruktur

| Kebutuhan | Pilihan | Catatan |
|---|---|---|
| Wallet di browser | **ChainSafe/WebZjs** (`@chainsafe/webzjs-wallet`) | Belum diaudit. Paket npm dilaporkan sudah lama tidak diperbarui, jadi **build dari source** (Rust nightly, `wasm-pack`, clang ≥ 17, `just`) dan commit artefak WASM-nya ke `web/public/webzjs/` atau ke paket workspace. |
| Lightwalletd | Proxy gRPC-web ChainSafe (mainnet) | Lightwalletd biasa (misalnya `zec.rocks`) **tidak bisa** dipanggil langsung dari browser. Untuk testnet atau regtest: jalankan proxy sendiri (`docker-compose` dari repo WebZjs) atau **ZecKit** (regtest Zebra + lightwalletd + faucet). |
| URI pembayaran | **ZIP-321** (`zcash:<UA>?amount=..&memo=<base64url>&label=..&message=..`) | Cukup dibuat dengan util kecil di TS (encode base64url untuk memo). Referensi: crate Rust `zip321`. |
| Wallet payer | **Zodl** (dulu Zashi) dan wallet lain yang mendukung ZIP-321 | Payer cukup scan QR. Bayar dari browser (WebZjs) jadi pelengkap. |
| Lintas chain (opsional) | **NEAR Intents 1Click API** | Alurnya: quote → alamat deposit → status. Ada laporan ZEC shielded melewati alamat transparan milik NEAR, jadi tampilkan kompromi privasinya. |
| Email | Resend (sudah ada) | Tidak berubah. |

### Integrasi WASM di Next.js
- Muat WebZjs **hanya di client** (`dynamic(() => import(...), { ssr: false })`),
  di dalam satu modul `src/lib/zcash/wallet.ts` sebagai pengganti `prover.ts`,
  `notes.ts`, `deposit.ts`, `withdraw.ts` dan `transfer.ts`.
- `initWasm()` dan `initThreadPool(navigator.hardwareConcurrency)` dipanggil
  **tepat sekali** per halaman (ini peringatan dari audit Hacken).
- **Risiko besar yang harus diuji di PoC:** thread pool WASM butuh
  `SharedArrayBuffer`, yang mensyaratkan header **COOP `same-origin`** dan
  **COEP `require-corp`/`credentialless`**. Header ini bisa **merusak iframe Privy**
  dan gambar dari domain lain. Rencana mitigasi:
  1. Coba `Cross-Origin-Embedder-Policy: credentialless` khusus di route dashboard.
  2. Kalau Privy tetap rusak, isolasi wallet di route `/wallet/*` yang tanpa Privy
     iframe, atau jalankan `initThreadPool(1)` (lebih lambat, tanpa SAB).
- Sync jalan di web worker, dan UI menampilkan progres ("Syncing 62%") dengan
  maskot `loading`.

## 4. Kunci dan akun

### 4.1 Derivasi
Sumber `master` tidak berubah (`lib/passkey.ts` untuk PRF, `lib/keys.ts` untuk escrow PIN).

```ts
// src/lib/zcash/seed.ts
const entropy = hkdf(sha256, master, undefined, utf8("meaw.zcash.seed.v1"), 32);
const mnemonic = entropyToMnemonic(entropy, wordlist); // 24 kata, @scure/bip39
// WebZjs: wallet.create_account("meaw", mnemonic, 0, birthdayHeight)
```

- **Account index** ZIP-32 = 0 untuk akun utama.
- **Birthday height** = tinggi blok saat akun dibuat. Disimpan di server (publik)
  supaya sync tidak mulai dari genesis.
- Bonus UX: user bisa **mengekspor mnemonic ke Zodl** sebagai cadangan (Settings →
  "Open in Zodl"), dengan peringatan yang jelas.

### 4.2 Yang dihapus
- `features/privacyKeys/*` (rotasi generasi key Monad) dan `lib/keys.ts`
  `deriveNoteSecrets`. Rotasi diganti dengan konsep **"akun baru" (ZIP-32 index
  berikutnya)** kalau masih dibutuhkan; untuk hackathon cukup satu akun.
- Kontrak `MaweeRegistry` diganti tabel `usernames` di Mongo (lihat §5).

### 4.3 Persistensi state wallet
WebZjs menyimpan DB wallet (note, riwayat dan UFVK; seed **tidak** termasuk).
- **Opsi A (paling aman, sesuai aturan repo sekarang):** DB hanya di memori dan
  sync ulang setiap unlock. Ini lambat untuk akun yang sudah lama.
- **Opsi B (rekomendasi):** serialisasi DB wallet, **enkripsi AES-GCM** dengan
  kunci `HKDF(master, "meaw.zcash.walletdb.v1")`, lalu simpan di IndexedDB.
  Tanpa passkey atau PIN, data itu tidak bisa dibaca. **Perbarui aturan di
  CLAUDE.md** supaya pengecualian ini tercatat.

## 5. Data dan server

### 5.1 Migrasi MongoDB (ESM, `web/migrations/`)
1. `20261015090000-zcash-accounts.js`
   - `usernames`: tambah `zcashUa` (string, unik), `zcashBirthday` (int),
     `network` (`main`/`test`), `uaSignature` (lihat §5.2).
   - Index unik `{ zcashUa: 1 }`.
2. `20261015091000-zcash-invoices.js`
   - `invoices`: hapus `commitment`, `salt` dan `poolScope`. Tambah `memoTag`
     (contoh `meaw:inv:<id>`), `asset: "ZEC"`, `amountZat` (string), `paidTxid?`,
     `paidReportedAt?`.
3. `20261015092000-drop-monad-collections.js`: arsipkan, lalu drop koleksi khusus
   Monad (`deposits`, `pool_*`, `sponsorship_*`, `relay_*`, `spend_reservations`,
   `request_operations`, `privacy_key_*`). **Backup dulu** (`mongodump`), dan
   jalankan hanya di database Zcash yang baru.

> Rekomendasi: pakai **database baru** (`meaw_zcash`) supaya data Monad tetap utuh
> dan migrasi bisa dibalik.

### 5.2 Kepercayaan username → alamat
Tanpa registry on-chain, server bisa saja mengganti alamat seseorang. Mitigasinya:
- Saat mendaftar, browser menandatangani `{username, zcashUa, birthday}` dengan
  wallet Privy user (EIP-191) atau dengan kunci Ed25519 turunan dari master.
  Server menyimpan signature itu.
- Halaman bayar **memverifikasi signature di browser payer** sebelum menampilkan
  QR. Kalau tidak cocok, tampilkan peringatan besar.

### 5.3 Modul server (pola `*.router/service/schema/errors`)
| Modul | Aksi |
|---|---|
| `usernames` | Ubah: simpan dan baca `zcashUa`, birthday, signature. |
| `wallets` | Sederhanakan: escrow PIN dan record passkey tetap; mapping wallet EVM hanya untuk login Privy. |
| `paymentLinks` | Ubah: asset `ZEC`, `amountZat`, `memoTag` per link. |
| `invoices` | Ubah: status **dilaporkan oleh pemilik** (lihat §6.3), tanpa verifikasi on-chain. |
| `requests` | Ubah: request antar username berisi ZIP-321 ke UA peminta; payload tetap terenkripsi ke penerima (x25519, `viewSk` lama bisa dipakai ulang untuk enkripsi pesan app). |
| `transfers` | Hapus. Kirim langsung lewat WebZjs (tidak ada operasi server). |
| `notifications` | Tetap. Pemicu baru: `paymentArrived` (ping payer/pemilik), `invoicePaid`, `requestCreated`. |
| `receipts` | Ubah ke receipt Zcash (§6.6). |
| `deposits`, `relay`, `sponsorship`, `privacyKeys` | **Hapus.** |
| `/api/cron/pool-indexer`, `/api/cron/request-payments` | **Hapus**, tidak ada mirror lagi. Cron hanya untuk pengingat invoice jatuh tempo (opsional). |
| `/api/fx` | Tetap, ditambah kurs **ZEC/USD** (tampilkan estimasi USD di semua nominal). |

## 6. Alur produk

### 6.1 Onboarding
1. Login Privy (email/Google), lalu pilih `@username` (UI sudah ada).
2. Passkey (atau PIN) menghasilkan `master`, lalu seed, lalu `create_account`
   dengan birthday = tinggi blok terbaru dari lightwalletd.
3. Ambil **Unified Address** (penerima Orchard), tanda tangani, simpan di server.
4. Dashboard menampilkan saldo 0 ZEC, QR alamat, dan link `meaw.xyz/pay/@user`.

### 6.2 Payment link → ZIP-321
- `/pay/@user` dan `/pay/@user/<slug>` menampilkan:
  - QR + tombol "Open in wallet" berisi
    `zcash:<UA>?amount=<ZEC>&memo=<base64url("meaw:link:<slug>")>&label=Meaw%20%40user`
  - estimasi USD, instruksi untuk Zodl, dan verifikasi signature UA (§5.2).
  - (opsional) "Bayar dari browser": WebZjs milik payer, kalau payer juga user Meaw.
- Link terbuka (tanpa nominal): parameter `amount` dihilangkan.
- Setelah payer menekan "I've paid", halaman memanggil `notifications.paymentArrived`.
  Server hanya mengirim email "ada pembayaran masuk" ke pemilik, tanpa nominal
  dan tanpa txid.

### 6.3 Invoice privat
- Membuat invoice: item, jatuh tempo, nominal ZEC (estimasi USD), `memoTag =
  meaw:inv:<id>`. Halaman publik `/i/<token>` menampilkan QR ZIP-321 dengan memo
  itu.
- **Status Paid ditentukan di browser pemilik:** setelah sync, wallet membaca memo
  note yang masuk. Note dengan `memoTag` yang cocok dan nominal ≥ tagihan membuat
  klien mengirim `invoices.markPaid({ id, txid })`. Server mempercayai pemilik,
  karena pemilik invoice adalah satu-satunya pihak yang bisa mengklaim invoicenya
  sudah dibayar.
- Halaman publik membaca status itu dan menampilkan maskot `success` dengan cap PAID.
- PDF invoice dan kuitansi (`lib/invoicePdf.ts`) dipakai ulang, dengan txid
  menggantikan data pool.

### 6.4 Saldo dan aktivitas
- `BalanceCard`: saldo Orchard terkonfirmasi + pending, dalam ZEC dengan estimasi
  USD. Pemilih aset multi-stablecoin dihapus (ZEC saja).
- `ActivityFeed`/History: dari riwayat transaksi WebZjs (masuk/keluar, memo
  ditampilkan sebagai keterangan: "Invoice INV-003", "Link: design-retainer").

### 6.5 Kirim, request, cash out
- **Send ke @username:** resolve UA (verifikasi signature), lalu propose, prove
  (sekitar 10 detik, tampilkan progres) dan kirim, dengan memo opsional.
- **Cash out:** kirim ke alamat Zcash mana pun, termasuk alamat transparan (exchange).
  Beri peringatan kalau tujuannya transparan ("penerima dan nominal akan publik").
- **Request:** pakai alur request yang sudah ada, tapi pembayaran memakai ZIP-321
  ke UA peminta dengan `memoTag = meaw:req:<id>`. Status Paid dilaporkan peminta
  dengan cara yang sama seperti invoice.

### 6.6 Disclosure / receipt untuk akuntan
Zcash belum punya standar "payment disclosure" yang final. Untuk hackathon:
- **Receipt v1:** `{ txid, block height, amount, memo, recipient UA }` + **output
  index**. Verifier (`/verify`) mengambil transaksi dari lightwalletd, lalu
  mencocokkan txid, tinggi blok dan konfirmasi. Ini bukti keberadaan transaksi,
  belum bukti isi note.
- **Receipt v2 (lebih kuat, kalau waktu cukup):** **akun ZIP-32 terpisah per
  klien atau invoice**. Membagikan IVK akun itu hanya membuka pembayaran untuk
  klien tersebut, tidak seluruh saldo. Ini bisa jadi pembeda di penjurian.

### 6.7 Lintas chain (opsional, kalau waktu tersisa)
- Di halaman bayar, tambahkan tab "Pay with USDC/ETH/SOL" lewat NEAR Intents 1Click:
  quote (dry) → quote (wet) menghasilkan alamat deposit → payer deposit di chain
  asal → polling status. ZEC dikirim ke UA penerima.
- Pastikan apakah 1Click bisa mengirim ke **alamat shielded** secara langsung.
  Kalau melewati alamat transparan, tampilkan label "less private" dan ceritakan
  kompromi ini dengan jujur.

## 7. Peta perubahan per file

### Dihapus
- `contracts/` (seluruhnya), `monad-zk/`, `indexer/` (Envio untuk Monad), `web/public/zk/`
- `web/src/lib/`: `abi.ts`, `agora.ts`, `chain.ts` (ganti `zcash/network.ts`),
  `deposit.ts`, `withdraw.ts`, `transfer.ts`, `prover.ts`, `notes.ts`,
  `poolMirror.ts`, `pools.ts`, `settlement.ts`, `typedData.ts`, `useGasless.ts`,
  `paymentAsset.ts`, `paymentLinkAsset.ts`
- `web/src/features/`: `sponsorship/`, `privacyKeys/`, `transfers/`,
  `payerWallet/` (diganti ZIP-321), bagian Monad di `requests/` dan `receipts/`
- `web/src/server/`: `lib/durableRelayer.ts`, `lib/relayer.ts`, `lib/relayJournal.ts`,
  `lib/spendReservations.ts`, `lib/envio.ts`; modul `deposits`, `relay`,
  `sponsorship`, `privacyKeys`, `transfers`
- Komponen: `AgoraFundingNotice`, `PrivacyPoolStat`, `DepositForm`,
  `RotatePrivacyKeyDialog`, `SendAusdAction`, `TransferProgress`,
  `PendingTransfersNotice`, `useLegacyBalances`, `useSelectedPool`,
  `PaymentAssetSelect` (atau sederhanakan jadi ZEC saja)
- Env: `NEXT_PUBLIC_MAWEE_*`, `NEXT_PUBLIC_USDC_*`, `NEXT_PUBLIC_MONAD_*`,
  `RELAYER_*`, `ENVIO_GRAPHQL_URL`, `MONAD_LOGS_BLOCK_RANGE`, `DEPLOYER_PRIVATE_KEY`

### Baru
- `web/src/lib/zcash/`
  - `network.ts`: `ZCASH_NETWORK` (`main`/`test`), URL lightwalletd proxy
  - `seed.ts`: master → mnemonic (§4.1)
  - `wallet.ts`: wrapper WebZjs (init sekali, account, sync, balance, history, send)
  - `zip321.ts`: build dan parse URI, memo base64url
  - `memo.ts`: format `meaw:<kind>:<id>` dan parser
  - `units.ts`: zatoshi ↔ ZEC (1 ZEC = 10^8 zat)
- `web/src/features/zcash/`: `useZcashWallet.ts` (sync, progres, saldo),
  `SyncProgress.tsx`, `PayWithZcashQr.tsx`
- Env baru (di `env.ts` / `.env.example`):
  `NEXT_PUBLIC_ZCASH_NETWORK`, `NEXT_PUBLIC_LIGHTWALLETD_URL`,
  `NEXT_PUBLIC_ZCASH_EXPLORER_URL`, (opsional) `NEAR_INTENTS_API_KEY`
- `next.config.mjs`: header COOP/COEP untuk route wallet, dan aturan WASM.

### Diubah (UI tetap, sumber data baru)
- `WalletProvider.tsx`: unlock menghasilkan seed, lalu wallet WebZjs (bukan note secrets).
- `Dashboard`, `BalanceCard`, `ActivityFeed`, `HistoryDashboard`, `WithdrawDashboard`
  (menjadi "Cash out"), `SendTransferDialog`, `ReceiveDialog`, `LinksDashboard`,
  `LinkEditorDialog`, `PaymentQrDialog`, `InvoiceCheckout`, `RequestsDashboard`,
  `CreateRequestDialog`, `PayRequestDialog`, `SettingsDashboard`
- Landing: copy diganti dari "USDC on Monad" menjadi "ZEC, shielded by Zcash",
  plus fakta (Orchard, Halo 2 tanpa trusted setup, ZIP-321).
- `README.md`, `CLAUDE.md`, `docs/` (GitBook): tulis ulang bagian teknis dan privasi.

## 8. Urutan kerja

Urutan berdasarkan ketergantungan, bukan tanggal. Fase berikutnya dimulai
setelah kriteria lulus fase sebelumnya terpenuhi.

| Fase | Isi | Bergantung pada | Kriteria lulus |
|---|---|---|---|
| F0 | Baca rules, pilih nama, buat repo baru, pilih jaringan | — | Keputusan tercatat |
| F1 | **PoC WebZjs**: build WASM, init di Next.js, uji COOP/COEP vs Privy, akun dari seed, sync, saldo | F0 | Saldo tampil di app; keputusan header dicatat |
| F2 | Kunci (passkey/PIN → seed), onboarding, profil dengan UA bertanda tangan | F1 | Akun baru punya UA terverifikasi |
| F3 | Receive + payment link (ZIP-321), verifikasi signature di halaman bayar | F2 | Bayar dari Zodl masuk dan memo terbaca |
| F4 | Dashboard (saldo, riwayat, sync) + Send ke @username + Cash out | F2 | Kirim dan cash out sukses dari browser |
| F5 | Invoice + deteksi Paid via memo + PDF | F3, F4 | Invoice otomatis Paid |
| F6 | Receipt v1 + `/verify` | F4 | Receipt terverifikasi |
| F7 | PWA, empty state, brand, landing | F2 | Installable, UI konsisten |
| F8 | (P2) Email notifikasi + request antar user | F5 | Email terkirim, request terbayar |
| F9 | (P3) Bayar lintas chain lewat NEAR Intents | F3 | Pembayaran dari chain lain diterima |
| F10 | Deploy (Vercel + Atlas), E2E mainnet nominal kecil | F5 | Link live stabil |
| F11 | Video demo, pitch, README, submit | F10 | Submission terkirim |

F3, F4, F6 dan F7 bisa dikerjakan paralel setelah F2 selesai.

**Prioritas kalau waktu tidak cukup:** potong F9 → F8 → receipt v2 → F7.
**Jangan dipotong:** F1–F6, F10 dan F11.

## 9. Risiko dan mitigasi

| Risiko | Dampak | Mitigasi |
|---|---|---|
| WebZjs gagal di-build atau dimuat (WASM) | Tinggi | Selesaikan PoC (F1) dulu sebelum mengubah apa pun. Cadangan: WASM `librustzcash` via `zcash_client_backend` sendiri (jauh lebih berat), atau versi tanpa wallet di browser (hanya ZIP-321 + IVK di browser untuk membaca saldo). |
| COOP/COEP merusak Privy | Tinggi | Coba `credentialless`; isolasi route wallet; `initThreadPool(1)` sebagai fallback. |
| Sync lambat | Sedang | Birthday height, sync di worker, simpan DB terenkripsi (§4.3), progres di UI. |
| Infrastruktur testnet tidak ada | Sedang | Mainnet dengan nominal kecil; dev lokal pakai ZecKit (regtest). |
| Server mengganti alamat username | Sedang | Signature UA diverifikasi di browser payer (§5.2). |
| Library belum diaudit | Rendah untuk hackathon | Sebutkan terang-terangan di README dan pitch; dana kecil saja. |
| Aturan melarang kode lama | Tinggi | Repo baru; salin modul UI dan sebutkan asal-usulnya. |

## 10. Kriteria selesai (Definition of Done)

- [ ] User baru: login → passkey → punya `@username` dan Unified Address Orchard
      tanpa pernah melihat seed phrase.
- [ ] Payer membayar link atau invoice dari **Zodl** lewat QR ZIP-321; dana tampil
      di saldo Meaw setelah sync.
- [ ] Invoice otomatis menjadi **Paid** berdasarkan memo, tanpa server mengetahui
      nominal atau pengirimnya.
- [ ] Send ke `@username` dan cash out ke alamat luar berhasil dari browser.
- [ ] Tidak ada seed, USK, UFVK atau viewing key yang dikirim ke server (diuji
      dengan test yang memeriksa payload tRPC).
- [ ] Build dan test lolos, tidak ada kode atau env Monad tersisa.
- [ ] Live di Vercel, video demo maksimal 3 menit, dan README menjelaskan model
      privasi serta keterbatasannya.

## 11. Sumber

- [ZECATHON](https://thezecathon.com/) · [pengumuman zkSNARKs](https://x.com/zksnarks_/status/2104606505177899314)
- [ChainSafe/WebZjs](https://github.com/ChainSafe/WebZjs) · [laporan kelayakan Zcash web](https://research.chainsafe.io/featured/Publications/Zcash-web-feasibility/) · [audit Hacken WebZjs Snap](https://hacken.io/audits/zcash/dapp-zcash-snap-may2025/)
- [ZIP-321 / crate `zip321`](https://docs.rs/zip321) · [Zcash developer docs](https://zcash.readthedocs.io/)
- [Zebra + lightwalletd](https://zebra.zfnd.org/user/lightwalletd.html) · [ZecKit devnet](https://github.com/marketplace/actions/zeckit-devnet)
- [Zashi menjadi Zodl](https://bitcoinist.com/zashi-becomes-zodl-zcash-wallet/)
- [NEAR Intents (ringkasan 1Click)](https://skills.cat/skills/near/agent-skills/near-intents) · [Brave + NEAR Intents](https://brave.com/blog/near-intents/)
