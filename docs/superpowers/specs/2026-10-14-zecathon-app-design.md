# Spesifikasi Desain: App Pembayaran Shielded di Zcash (ZECATHON)

Status: **Draf v1**, 14 Oktober 2026
Codename kerja: **`Zua`** (nama final belum ditentukan, lihat §17)
Target: ZECATHON, track **Shielded Payments** (deadline 28 Oktober 2026, perlu dikonfirmasi)

Dokumen ini adalah spesifikasi untuk **app baru**, bukan lanjutan Meaw. Meaw (Monad)
hanya dipakai sebagai referensi pola UX dan desain. Repo, nama, brand, domain,
database dan deploy semuanya baru.

---

## 1. Ringkasan produk

**Zua** adalah aplikasi untuk freelancer dan bisnis kecil supaya bisa **ditagih
dan dibayar dalam ZEC secara shielded**, dengan pengalaman seperti app pembayaran
biasa:

- Daftar dengan email atau Google + passkey. **Tidak ada seed phrase.**
- Punya **@username**, **payment link**, dan **invoice** yang bisa dibayar dari wallet
  Zcash mana pun (misalnya Zodl) cukup dengan scan QR.
- Saldo, riwayat dan status invoice dibaca **di browser** dari blockchain Zcash.
  Server tidak pernah tahu siapa membayar siapa dan berapa.
- Kirim ke @username lain dan cash out ke alamat mana pun, dengan bukti ZK
  (Halo 2/Orchard) dibuat di browser.
- **Receipt** untuk akuntan yang membuka satu pembayaran tanpa membuka saldo lain.

### Kalimat pitch
> "Venmo-nya Zcash: tagih, terima dan kirim ZEC shielded dengan username dan link,
> tanpa seed phrase, dan tanpa server yang bisa melihat keuanganmu."

### Kenapa cocok dengan track Shielded Payments
Track ini meminta "money that moves without publishing who paid whom", termasuk
point of sale, payroll, remittance dan subscriptions. Zua menutup alur
**invoice → bayar → terima → cash out** sepenuhnya di pool Orchard, dengan UX
untuk orang yang bukan pengguna crypto.

---

## 2. Tujuan dan non-tujuan

### Tujuan (wajib untuk submission)
1. Onboarding tanpa seed phrase: login → passkey → @username → Unified Address.
2. Terima pembayaran lewat **payment link** dan **invoice** dalam format **ZIP-321**.
3. Saldo dan riwayat dari sync lightwalletd + dekripsi di browser.
4. Deteksi **invoice lunas** dari memo terenkripsi, di browser pemilik.
5. **Kirim ke @username** dan **cash out** ke alamat Zcash mana pun.
6. **Receipt** per pembayaran yang bisa diverifikasi pihak ketiga.
7. Bisa di-install sebagai PWA, live di internet, dengan video demo.

### Tujuan tambahan (kalau waktu cukup)
- Notifikasi email.
- Request antar username.
- Bayar dari chain lain lewat NEAR Intents.
- Akun per klien untuk disclosure yang lebih sempit (§9.3).

### Non-tujuan
- Stablecoin dan multi-aset (hanya ZEC).
- Swap, on-ramp kartu, aplikasi mobile native.
- Custody: server tidak pernah memegang dana atau kunci.
- Dukungan alamat transparan untuk **menerima** (hanya Orchard). Mengirim ke
  alamat transparan boleh, dengan peringatan.

---

## 3. Persona dan skenario

| Persona | Kebutuhan | Skenario utama |
|---|---|---|
| **Dinar**, freelancer desain | Ditagih dari klien luar negeri tanpa membuka tarif dan riwayat pemasukan | Membuat invoice 0,8 ZEC, mengirim link ke klien, invoice berubah Paid, lalu cash out ke exchange |
| **Klien Dinar** (payer) | Membayar cepat tanpa daftar akun | Membuka link invoice, scan QR dengan Zodl, bayar, melihat status Paid |
| **Toko kecil** | Menerima pembayaran di kasir | Membuka mode "Receive" dengan nominal, menampilkan QR di layar HP, lalu pembeli scan |
| **Akuntan Dinar** | Bukti satu pembayaran untuk pajak | Membuka `/verify`, unggah receipt, melihat transaksi terverifikasi |

---

## 4. Ruang lingkup fitur (MVP)

| ID | Fitur | Prioritas |
|---|---|---|
| F1 | Auth: login Privy (email/Google) | P0 |
| F2 | Kunci: passkey PRF atau PIN → seed (§7) | P0 |
| F3 | Username + Unified Address terdaftar dan ditandatangani | P0 |
| F4 | Dashboard: saldo (ZEC + estimasi USD), riwayat, status sync | P0 |
| F5 | Receive: QR alamat dan QR nominal (ZIP-321) | P0 |
| F6 | Payment link (`/u/@user`, `/u/@user/<slug>`) | P0 |
| F7 | Invoice (buat, halaman publik, deteksi Paid, PDF) | P0 |
| F8 | Send ke @username / alamat | P0 |
| F9 | Cash out ke alamat luar (dengan peringatan transparan) | P0 |
| F10 | Receipt + halaman `/verify` | P1 |
| F11 | PWA (install, offline page) | P1 |
| F12 | Email notifikasi | P2 |
| F13 | Request antar username | P2 |
| F14 | Bayar lintas chain (NEAR Intents) | P3 |

---

## 5. Arsitektur

### 5.1 Komponen

```
┌──────────────────────────── Browser ─────────────────────────────┐
│ Next.js (React 19, client)                                       │
│  ├─ Auth: Privy (login saja)                                     │
│  ├─ KeyVault: passkey PRF / PIN escrow → master → seed (memori)  │
│  ├─ ZcashWallet (Web Worker + WASM WebZjs)                       │
│  │    sync · balance · history · memo · propose/prove/send       │
│  ├─ WalletStore: DB wallet terenkripsi (AES-GCM) di IndexedDB    │
│  └─ UI: dashboard, links, invoices, send, receive, settings      │
└───────────────┬───────────────────────────────┬──────────────────┘
                │ tRPC (HTTPS)                  │ gRPC-web
┌───────────────▼────────────┐   ┌──────────────▼──────────────────┐
│ Server Next.js (Vercel)     │   │ lightwalletd proxy (gRPC-web)   │
│  tRPC + MongoDB Atlas       │   │  → lightwalletd → zebrad        │
│  profiles, links, invoices, │   └─────────────────────────────────┘
│  receipts meta, notif       │
│  TIDAK punya kunci / saldo  │
└─────────────────────────────┘
```

### 5.2 Prinsip
1. **Client-side crypto:** seed, USK, UFVK, IVK dan note hanya ada di browser.
2. **Server bodoh soal uang:** server hanya menyimpan data publik (username, UA,
   birthday) dan metadata yang memang dibuat user (link, invoice). Status Paid
   *dilaporkan* oleh pemilik.
3. **Interoperabilitas:** payer tidak harus memakai Zua; standarnya ZIP-321.
4. **Fail safe:** kalau server mati, dana tetap aman dan bisa dipulihkan di Zodl
   dengan mnemonic yang diturunkan dari passkey (§7.4).

---

## 6. Tech stack dan struktur repo

| Lapisan | Pilihan |
|---|---|
| Framework | Next.js 15 (App Router), React 19, TypeScript strict |
| Styling | Tailwind 4, design token sendiri (brand baru) |
| API | tRPC 11 + zod |
| DB | MongoDB Atlas + migrate-mongo (ESM) |
| Auth | Privy (`@privy-io/react-auth`, `@privy-io/node`) |
| Zcash | ChainSafe **WebZjs** (dibangun dari source, dipaket sebagai workspace `packages/webzjs`) |
| Kripto JS | `@noble/hashes` (HKDF, SHA-256), `@noble/ciphers` (AES-GCM), `@scure/bip39`, `hash-wasm` (Argon2id untuk PIN) |
| PDF | Renderer vektor di sisi client (pola dari Meaw) |
| Test | Vitest (+ happy-dom), Playwright untuk E2E smoke |
| Format | Biome |
| Deploy | Vercel (web) + MongoDB Atlas; proxy lightwalletd: ChainSafe (mainnet) atau self-host |

### Struktur repo (monorepo pnpm)

```
zua/
├─ apps/web/                     # Next.js
│  ├─ src/app/                   # routes (§11)
│  ├─ src/components/            # UI
│  ├─ src/features/<domain>/     # hooks + komponen per domain
│  ├─ src/lib/zcash/             # network, seed, wallet client, zip321, memo, units
│  ├─ src/lib/keys/              # passkey PRF, PIN escrow, HKDF
│  ├─ src/server/modules/<name>/ # *.router / *.service / *.schema / *.errors
│  ├─ src/workers/wallet.worker.ts
│  ├─ migrations/
│  └─ test/
├─ packages/webzjs/              # artefak WASM + typings hasil build WebZjs
├─ docs/
└─ README.md
```

---

## 7. Desain kunci

### 7.1 Sumber master (32 byte)
- **Passkey (utama):** WebAuthn PRF dengan salt `sha256("zua.prf.master.v1")`
  menghasilkan output PRF, lalu `master = HKDF-SHA256(prf, info="zua.master.v1")`.
- **PIN (cadangan/perangkat tanpa PRF):** `master` acak 32 byte, dienkripsi dengan
  kunci dari `Argon2id(PIN, salt, m=19456, t=2, p=1)` + AES-GCM. **Blob escrow**
  disimpan di server; PIN tidak pernah dikirim.
- Satu akun boleh memiliki keduanya: passkey membungkus master yang sama
  (server menyimpan `wrappedMaster` per credential).

### 7.2 Turunan

| Kunci | Derivasi | Disimpan? |
|---|---|---|
| Seed Zcash | `entropy = HKDF(master, "zua.zcash.seed.v1", 32)` → **BIP39 24 kata** | Tidak (memori) |
| USK / UFVK / UA | ZIP-32 dari seed, akun index 0 (di WebZjs) | UFVK hanya di DB wallet terenkripsi; **UA** publik di server |
| Kunci DB wallet | `HKDF(master, "zua.walletdb.v1", 32)` → AES-256-GCM | Tidak |
| Kunci tanda tangan profil | `Ed25519(seed = HKDF(master, "zua.profile-sign.v1", 32))` | Pubkey publik di server |
| Kunci enkripsi pesan app (request) | `X25519(HKDF(master, "zua.msg.v1", 32))` | Pubkey publik di server |

### 7.3 Birthday height
Saat akun dibuat, client mengambil `latestBlock` dari lightwalletd. `birthday =
latest - 100` (buffer reorg), disimpan di profil (publik). Sync tidak pernah mulai
sebelum birthday.

### 7.4 Pemulihan dan ekspor
- Perangkat baru: login Privy → passkey (synced) atau PIN, lalu master yang sama,
  seed yang sama, dan **sync ulang** dari birthday.
- **Export ke Zodl** (Settings → "Back up to a Zcash wallet"): tampilkan 24 kata
  setelah re-autentikasi, dengan peringatan. Ini menjamin dana tidak terkunci
  di Zua.

### 7.5 Aturan keras
- Seed, USK dan mnemonic **tidak pernah** dikirim ke server, ditulis ke log, atau
  disimpan tanpa enkripsi.
- Ada test yang memeriksa bahwa payload tRPC tidak pernah berisi string mirip
  mnemonic/UFVK (`uview`, `secret-extended-key`, 24 kata BIP39).

---

## 8. Integrasi Zcash

### 8.1 Jaringan
- `NEXT_PUBLIC_ZCASH_NETWORK = "main" | "test"`; default **main** untuk demo
  (nominal kecil), **regtest via ZecKit** untuk dev lokal dan E2E.
- `NEXT_PUBLIC_LIGHTWALLETD_URL`: proxy gRPC-web (mainnet:
  `https://zcash-mainnet.chainsafe.dev`).
- Konfirmasi: saldo **spendable** setelah 3 konfirmasi; tampilkan "pending" sebelum itu.

### 8.2 WalletClient (`src/lib/zcash/wallet.ts`)
Berjalan di Web Worker (`wallet.worker.ts`) supaya proving dan sync tidak membekukan UI.
API (dipanggil lewat Comlink atau `postMessage`):

```ts
interface WalletClient {
  init(opts: { network: "main" | "test"; lightwalletdUrl: string }): Promise<void>; // initWasm + initThreadPool sekali
  open(opts: { mnemonic: string; birthday: number; encryptedDb?: Uint8Array; dbKey: Uint8Array }): Promise<void>;
  sync(onProgress: (p: { scanned: number; target: number }) => void): Promise<void>;
  address(): Promise<string>;                       // UA dengan penerima Orchard
  balance(): Promise<{ spendable: bigint; pending: bigint }>; // zatoshi
  history(): Promise<WalletTx[]>;                   // termasuk memo yang sudah didekripsi
  proposeSend(to: string, amountZat: bigint, memo?: string): Promise<Proposal>; // fee ZIP-317
  executeProposal(p: Proposal, onStage: (s: "proving" | "broadcasting") => void): Promise<{ txid: string }>;
  exportDb(): Promise<Uint8Array>;                  // dienkripsi pemanggil dengan dbKey
  close(): Promise<void>;                           // hapus seed dari memori
}

type WalletTx = {
  txid: string; height: number | null; timestamp: number | null;
  direction: "in" | "out" | "self";
  amountZat: bigint; feeZat?: bigint;
  memos: string[]; // memo teks (UTF-8) yang terbaca
  toAddress?: string;
};
```

### 8.3 Persistensi DB wallet
- Setelah setiap sync atau kirim: `exportDb()` → AES-GCM(dbKey) → IndexedDB
  (`zua-wallet/<userId>`).
- Saat unlock, DB didekripsi lalu sync lanjut dari tinggi terakhir.
- Kalau dekripsi gagal atau DB rusak: hapus, lalu sync ulang dari birthday.

### 8.4 COOP/COEP (thread pool WASM)
- Thread pool butuh `SharedArrayBuffer`, yang mensyaratkan
  `Cross-Origin-Opener-Policy: same-origin` dan
  `Cross-Origin-Embedder-Policy: credentialless` (atau `require-corp`).
- **Harus diuji di PoC** bersama Privy. Urutan fallback:
  1. COEP `credentialless` di semua route app.
  2. Route `/app/*` dengan header itu, sedangkan login Privy di route lain tanpa header.
  3. `initThreadPool(1)` tanpa SAB (proving lebih lambat, sekitar 2–4×).

### 8.5 ZIP-321 (`src/lib/zcash/zip321.ts`)
Format yang dihasilkan:

```
zcash:<UA>?amount=<ZEC desimal>&memo=<base64url(UTF-8)>&label=<urlencoded>&message=<urlencoded>
```

- `amount` maksimal 8 desimal, tanpa nol di belakang (`0.8`, bukan `0.80000000`).
- `memo` hanya untuk alamat shielded (UA Orchard), maksimal 512 byte sebelum encode.
- `label` = `@username di Zua`, `message` = judul invoice/link.
- Parser untuk menerima URI dari QR (fitur Send: scan QR payer lain).
- Test vector diambil dari spesifikasi ZIP-321.

### 8.6 Format memo (`src/lib/zcash/memo.ts`)

```
zua:<kind>:<id>[:<v>]
kind ∈ { inv, link, req, tip }
id   = base62, 10–16 karakter, unik
v    = versi format (opsional, default 1)
```

Contoh: `app:inv:7Kq2mZp9Xa`. Parser **toleran**: memo lain dianggap catatan bebas
dari payer dan ditampilkan apa adanya (disanitasi, maksimal 512 byte).

### 8.7 Kurs
`/api/fx` mengambil ZEC/USD (CoinGecko atau sejenisnya, cache 60 detik). Kurs
hanya untuk tampilan dan selalu diberi label "≈".

---

## 9. Alur detail

### 9.1 Onboarding
1. `/` → "Get started" → login Privy.
2. Pilih `@username` (3–20 karakter, `[a-z0-9_]`, unik, daftar kata terlarang).
3. Buat passkey (PRF). Kalau tidak didukung, buat PIN 6 digit.
4. Client: master → seed → `WalletClient.open` → `address()` → `birthday`.
5. Client menandatangani `ProfileClaim` (§10.2) dengan kunci Ed25519 profil.
6. `profiles.create({ username, ua, birthday, signPubkey, msgPubkey, claimSig })`.
7. Masuk dashboard: saldo 0, kartu "Your payment link", tombol "Receive".

### 9.2 Receive dan payment link
- **Receive (kasir):** input nominal (opsional) dan catatan, lalu tampilkan QR ZIP-321
  layar penuh dan tombol "Share link". Sembari menunggu, wallet sync tiap 15 detik.
  Begitu ada transaksi masuk yang memonya cocok dengan sesi ini, maskot dan animasi
  sukses tampil.
- **Link pribadi** `/u/@dinar`: payer memasukkan nominal (opsional), lalu QR
  dibuat di browser payer.
- **Link terkelola** `/u/@dinar/<slug>`: judul, deskripsi, nominal tetap atau bebas.
  Memo `app:link:<id>`.
- Halaman bayar **memverifikasi `claimSig`** (§10.2) sebelum menampilkan QR.
  Kalau gagal: blokir dan tampilkan "This address could not be verified".
- Tombol "I've paid" (opsional) memanggil `notifications.paymentPing` (§9.7).

### 9.3 Invoice
**Buat (pemilik):** nomor otomatis `INV-YYYY-NNN`, nama dan email klien (opsional),
item (deskripsi, qty, harga dalam ZEC atau USD → dikonversi ke ZEC saat dibuat),
catatan, jatuh tempo. Hasilnya `memoTag = app:inv:<id>`, `token` publik 128-bit,
dan status `open`.

**Halaman publik** `/i/<token>`: tampilan invoice, QR ZIP-321 (total, memo),
"Download PDF", dan status.

**Deteksi lunas (di browser pemilik):**
```
untuk setiap tx masuk baru (dari history setelah sync):
  untuk setiap memo m di tx.memos:
    jika parse(m) = { kind: "inv", id } dan invoice id milik saya & status open:
      paid[id] += tx.amountZat (akumulasi pembayaran parsial)
      jika paid[id] >= invoice.totalZat:
        invoices.markPaid({ id, txids, paidZat })   // dilaporkan pemilik
```
- Status: `open` → `partially_paid` → `paid`; atau `void` (dibatalkan pemilik);
  `overdue` diturunkan dari `dueDate`.
- Halaman publik melakukan polling status tiap 20 detik. Karena payer tidak bisa
  membuktikan apa pun ke server, status Paid hanya dari laporan pemilik. Ini
  dijelaskan di UI ("Confirmed by the recipient").

**Akun per klien (P2, disclosure sempit):** opsi "Use a separate account for this
client" membuat UA dari ZIP-32 account index baru. Membagikan IVK akun itu ke akuntan
hanya membuka pembayaran dari klien tersebut.

### 9.4 Send ke @username / alamat
1. Input: `@username`, UA, alamat Sapling/transparan, atau scan QR ZIP-321.
2. Kalau tujuannya `@username`: `profiles.get` → verifikasi `claimSig` → UA.
3. `proposeSend` menghasilkan fee ZIP-317. Tampilkan ringkasan: nominal, fee, total,
   tujuan, memo, dan jenis tujuan (shielded/transparan).
4. Konfirmasi ulang dengan passkey/PIN untuk transaksi > 0,5 ZEC (dapat diatur).
5. `executeProposal`: progres "Proving…" (sekitar 10 detik) lalu "Broadcasting…",
   dan menghasilkan `txid`.
6. Sukses: maskot sukses, link explorer, tombol "Download receipt".

### 9.5 Cash out
Sama dengan Send, tujuannya alamat milik sendiri (misalnya exchange). Kalau tujuannya
**transparan** (`t1…`), tampilkan peringatan: "Nominal dan tujuan akan terlihat
publik di blockchain. Dana keluar dari pool shielded." User harus mencentang
konfirmasi.

### 9.6 Receipt dan verifikasi
**Receipt v1** (JSON + PDF):
```json
{
  "version": 1,
  "network": "main",
  "txid": "…",
  "blockHeight": 2912345,
  "blockHash": "…",
  "direction": "in",
  "amountZat": "80000000",
  "memo": "app:inv:7Kq2mZp9Xa",
  "recipient": { "username": "dinar", "ua": "u1…" },
  "issuedAt": "2026-10-20T10:00:00Z",
  "issuerSig": "<Ed25519 di atas hash kanonik field-field di atas>"
}
```
**`/verify`** (di browser, tanpa login):
1. Validasi skema dan tanda tangan issuer dengan `signPubkey` profil.
2. Ambil block dan tx dari lightwalletd: pastikan txid ada di `blockHeight`, hash
   cocok, dan konfirmasi ≥ 10.
3. Hasil: **Verified (transaksi ada dan receipt ditandatangani penerima)**.
   Batasannya ditulis jelas: v1 tidak membuktikan nominal di dalam transaksi
   shielded secara kriptografis.

**Receipt v2 (P2):** sertakan IVK dari akun per klien (§9.3). Verifier men-trial-decrypt
tx untuk membuktikan nominal dan memo.

### 9.7 Notifikasi email (P2)
- Opt-in di Settings. Email penerima diambil dari Privy dan bisa diubah.
- Pemicu:
  - `paymentPing` dari payer (tombol "I've paid"): email "Someone says they paid you"
    tanpa nominal, dengan rate limit per penerima.
  - `invoices.markPaid` → email ke pemilik (ringkasan) dan, kalau ada, kuitansi ke
    email klien.
  - Request baru → email ke penerima request.
- Tidak ada txid, alamat atau saldo di isi email.

### 9.8 Request antar username (P2)
Peminta membuat request (nominal, catatan) yang dienkripsi X25519 ke `msgPubkey`
penerima. Penerima membuka request, menekan "Pay", lalu Send ke UA peminta dengan
`memo = app:req:<id>`. Peminta mendeteksi lunas seperti invoice.

### 9.9 Lintas chain (P3)
NEAR Intents 1Click: payer memilih aset asal (USDC/ETH/SOL), lalu quote (dry) →
quote (wet) yang menghasilkan alamat deposit → payer deposit → polling status → ZEC
terkirim ke UA penerima. Kalau rute ZEC melewati alamat transparan, tampilkan
label "Less private route".

---

## 10. Model data (MongoDB)

Semua `_id` adalah ObjectId kecuali disebut lain. Semua tanggal UTC.

### 10.1 `users`
```ts
{
  _id, privyUserId: string /*unik*/, email?: string,
  createdAt: Date, updatedAt: Date
}
```

### 10.2 `profiles`
```ts
{
  _id, userId: ObjectId /*unik*/,
  username: string /*unik, lowercase*/,
  network: "main" | "test",
  ua: string /*unik*/, birthday: number,
  signPubkey: string /*Ed25519 hex*/, msgPubkey: string /*X25519 hex*/,
  claim: { username, ua, birthday, network, signPubkey, msgPubkey, issuedAt },
  claimSig: string, // Ed25519(signPubkey) atas JSON kanonik `claim`
  createdAt, updatedAt
}
```
`ProfileClaim` diverifikasi di setiap client yang memakai UA orang lain. Server
tidak bisa memalsukannya karena tidak punya kunci tanda tangan. Kalau server
mengganti `signPubkey` dan UA sekaligus, mitigasinya adalah pin TOFU: client
menyimpan `signPubkey` username yang pernah dilihat di localStorage dan memberi
peringatan kalau berubah.

### 10.3 `key_escrow`
```ts
{
  _id, userId, kind: "pin" | "passkey",
  credentialId?: string, transports?: string[],
  wrappedMaster: { ct, iv, salt?, kdf?: { m, t, p } },
  createdAt
}
```

### 10.4 `payment_links`
```ts
{
  _id, ownerId, slug: string /*unik per owner*/,
  title: string, description?: string,
  amountZat?: string /*null = bebas*/, memoTag: string,
  archived: boolean, createdAt, updatedAt
}
```

### 10.5 `invoices`
```ts
{
  _id, ownerId, number: string /*unik per owner*/, token: string /*unik*/,
  client: { name?: string; email?: string },
  items: { description: string; quantity: number; unitZat: string }[],
  totalZat: string, currencyNote?: { usdAtCreation: string },
  notes?: string, dueDate?: Date,
  memoTag: string /*unik*/, accountIndex: number /*0 = utama*/,
  status: "open" | "partially_paid" | "paid" | "void",
  paidZat: string, paidTxids: string[], paidReportedAt?: Date,
  createdAt, updatedAt
}
```

### 10.6 `requests` (P2)
```ts
{ _id, fromProfileId, toProfileId, envelope: { epk, ct, nonce }, memoTag,
  status: "pending" | "paid" | "declined" | "cancelled", paidTxids: string[],
  createdAt, updatedAt }
```

### 10.7 `notification_settings`, `notification_log` (P2)
Sama polanya dengan Meaw: opt-in per event, `unsubscribeToken`, dan log idempoten
`eventKey` unik.

### 10.8 Index
`users.privyUserId` unik · `profiles.username` unik · `profiles.ua` unik ·
`payment_links {ownerId, slug}` unik · `invoices.token` unik ·
`invoices.memoTag` unik · `invoices {ownerId, number}` unik ·
`invoices {ownerId, createdAt:-1}`.

---

## 11. Route dan halaman

| Route | Akses | Isi |
|---|---|---|
| `/` | Publik | Landing (brand baru), CTA "Get started" |
| `/onboarding` | Login | Username, lalu passkey/PIN, lalu pembuatan wallet |
| `/app` | Login + unlock | Dashboard: saldo, sync, aktivitas, link, invoice terbaru |
| `/app/receive` | Login | QR alamat dan QR nominal (mode kasir) |
| `/app/send` | Login + unlock | Send/cash out |
| `/app/links` | Login | Kelola payment link |
| `/app/invoices` | Login | Daftar dan buat invoice |
| `/app/invoices/[id]` | Login | Detail, status, PDF, void |
| `/app/requests` | Login | (P2) |
| `/app/settings` | Login | Keamanan (passkey/PIN), backup ke Zodl, email, jaringan |
| `/u/[username]` | Publik | Link pribadi (ZIP-321) |
| `/u/[username]/[slug]` | Publik | Link terkelola |
| `/i/[token]` | Publik | Invoice publik |
| `/verify` | Publik | Verifikasi receipt |
| `/privacy`, `/terms` | Publik | Dokumen |
| `/api/trpc/[trpc]` | — | tRPC |
| `/api/fx` | Publik | Kurs ZEC/USD |

Middleware menjaga `/app/*` dan `/onboarding` dengan cookie Privy (pola Meaw).

---

## 12. API (tRPC)

Konvensi: `publicProcedure` / `protectedProcedure` (token Privy). Error domain
dipetakan ke `TRPCError` di router.

| Router | Procedure | Input (zod) | Output |
|---|---|---|---|
| `profiles` | `create` 🔒 | `{ username, network, ua, birthday, signPubkey, msgPubkey, claim, claimSig }` | `Profile` |
| | `me` 🔒 | — | `Profile \| null` |
| | `byUsername` | `{ username }` | `PublicProfile` (username, ua, birthday, signPubkey, msgPubkey, claim, claimSig) |
| | `usernameAvailable` | `{ username }` | `{ available }` |
| `escrow` | `get` 🔒 | — | `EscrowRecord[]` |
| | `putPin` 🔒 | `{ wrappedMaster }` | `ok` |
| | `putPasskey` 🔒 | `{ credentialId, transports, wrappedMaster }` | `ok` |
| `links` | `list` 🔒 / `create` 🔒 / `update` 🔒 / `archive` 🔒 | … | `PaymentLink` |
| | `public` | `{ username, slug }` | `PublicLink` |
| `invoices` | `list` 🔒 / `create` 🔒 / `void` 🔒 | … | `Invoice` |
| | `markPaid` 🔒 | `{ id, txids: string[], paidZat }` | `Invoice` |
| | `public` | `{ token }` | `PublicInvoice` (tanpa email klien) |
| `requests` (P2) | `create` 🔒 / `incoming` 🔒 / `outgoing` 🔒 / `markPaid` 🔒 / `decline` 🔒 | … | … |
| `notifications` (P2) | `settings` 🔒 / `update` 🔒 / `paymentPing` / `unsubscribe` | … | … |
| `receipts` | `issuerKey` | `{ username }` | `{ signPubkey }` |

Validasi penting:
- `ua` harus diawali `u1` (mainnet) atau `utest1` (testnet), dan dekode bech32m-nya
  berisi penerima Orchard. Dicek di server dengan util decoder ringan, atau
  minimal regex plus panjang, lalu dicek penuh di client.
- `claimSig` diverifikasi di server juga (menolak klaim palsu sejak awal).
- `markPaid` hanya untuk pemilik. `paidZat` disimpan apa adanya, tanpa verifikasi on-chain.
- Rate limit: `paymentPing` 10/jam per username, `usernameAvailable` 60/menit per IP.

---

## 13. UI dan brand

- **Brand baru:** nama, logo, warna dan maskot (opsional) **tidak** memakai aset Meaw
  (kucing pixel, nama). Kalau mau memakai maskot, buat karakter baru, misalnya zebra
  pixel sebagai nod ke Zebra/Zcash.
- **Bahasa visual:** pola yang sudah terbukti di Meaw (panel "ledger" kotak, label
  uppercase mono, kontrol rounded, dither background) boleh dipakai ulang sebagai
  pola, dengan token warna baru (aksen kuning Zcash `#F4B728` hanya untuk tanda,
  bukan teks).
- **Komponen inti:** `BalanceCard`, `SyncStatus` (progres %, "Up to date"),
  `QrPanel` (QR + copy + share + "Open in wallet"), `InvoiceView`,
  `SendReview` (ringkasan fee/tujuan, peringatan transparan), `ProvingProgress`,
  `EmptyState`, `BackLink`.
- **Status sync** selalu terlihat di dashboard. Kalau belum sync, saldo ditandai "≈ syncing".
- **Aksesibilitas:** kontras AA, fokus terlihat, QR selalu disertai teks alamat
  yang bisa disalin, `prefers-reduced-motion` dihormati.
- **Mobile-first:** semua alur utama nyaman di lebar 360 px; PWA standalone.

---

## 14. Keamanan dan privasi

### 14.1 Yang diketahui server
| Data | Diketahui server? |
|---|---|
| Email, username, UA, birthday, pubkey | Ya (publik/identitas) |
| Payment link dan invoice (judul, nominal, klien) | Ya (dibuat user) |
| Invoice mana yang lunas dan kapan (dilaporkan pemilik) | Ya |
| Saldo, riwayat transaksi, pengirim, memo | **Tidak** |
| Seed, USK, UFVK, IVK | **Tidak** |
| IP payer yang membuka halaman bayar | Ya (log hosting), jangan disimpan di DB |

### 14.2 Ancaman dan mitigasi
| Ancaman | Mitigasi |
|---|---|
| Server/DB disusupi lalu UA diganti | `claimSig` + pin TOFU di client (§10.2) |
| XSS mencuri seed di memori | CSP ketat (`script-src 'self' 'wasm-unsafe-eval'` + Privy), tidak memakai `dangerouslySetInnerHTML`, memo selalu disanitasi |
| Phishing halaman bayar | Domain tunggal, UA ditampilkan + diverifikasi, peringatan jika verifikasi gagal |
| Kehilangan perangkat | Passkey synced / PIN escrow + backup mnemonic ke Zodl |
| Brute force PIN | Argon2id + rate limit `escrow.get` + lockout setelah 10 percobaan gagal |
| Lightwalletd jahat (data sync palsu) | Saldo hanya dari note yang didekripsi sendiri; pakai proxy terpercaya; tampilkan tinggi blok dan sumber |
| Korelasi waktu (payer ping) | Ping opsional, tanpa nominal, tanpa txid |
| Library belum diaudit | Dinyatakan jelas di README dan UI ("Experimental, use small amounts") |

---

## 15. Konfigurasi (env)

### Publik (`src/env.ts`)
| Nama | Contoh |
|---|---|
| `NEXT_PUBLIC_APP_NAME` | `Zua` |
| `NEXT_PUBLIC_APP_URL` | `https://zua.xyz` |
| `NEXT_PUBLIC_ZCASH_NETWORK` | `main` |
| `NEXT_PUBLIC_LIGHTWALLETD_URL` | `https://zcash-mainnet.chainsafe.dev` |
| `NEXT_PUBLIC_ZCASH_EXPLORER_TX_URL` | `https://mainnet.zcashexplorer.app/transactions/{txid}` |
| `NEXT_PUBLIC_PRIVY_APP_ID` | — |
| `NEXT_PUBLIC_MIN_CONFIRMATIONS` | `3` |

### Server (`src/env.server.ts`)
`MONGODB_URI`, `PRIVY_APP_ID`, `PRIVY_APP_SECRET`, `RESEND_API_KEY?`, `EMAIL_FROM?`,
`FX_API_KEY?`, `NEAR_INTENTS_API_KEY?`, `CRON_SECRET?`.

### Header (`next.config.mjs`)
COOP/COEP sesuai hasil PoC (§8.4), CSP, `Referrer-Policy: no-referrer` untuk
`/i/*` dan `/u/*`.

---

## 16. Pengujian

| Lapisan | Cakupan |
|---|---|
| Unit (Vitest) | `zip321` (test vector ZIP-321), `memo` (parse/format/sanitasi), `units` (zat↔ZEC, pembulatan), `seed` (vector HKDF→BIP39 deterministik), `claim` (tanda tangan kanonik, tolak klaim palsu), status invoice (parsial, lunas, overdue, void) |
| Server | Router dengan Mongo in-memory: unik username/UA, otorisasi `markPaid`, rate limit, migrasi idempoten |
| Komponen (happy-dom) | Onboarding, QrPanel, SendReview (peringatan transparan), InvoiceView (status) |
| Privasi | Snapshot payload tRPC: tidak ada pola mnemonic/UFVK/USK |
| E2E (Playwright, regtest ZecKit) | Onboarding → Receive → bayar dari wallet kedua → saldo masuk → invoice Paid → send → cash out |
| Manual mainnet | Satu siklus dengan nominal sangat kecil + bayar dari Zodl (direkam untuk video) |

---

## 17. Keputusan yang masih terbuka

| # | Pertanyaan | Opsi / rekomendasi |
|---|---|---|
| 1 | Nama app | Usulan: **Hush**, **Veil Pay**, **Zipp**, **Shush**, **Zebra Pay**. Cek ketersediaan domain dan trademark. |
| 2 | Aturan hackathon soal kode lama | Kalau dilarang: repo baru, tulis ulang. Pola desain boleh, kode Meaw jangan disalin. |
| 3 | Mainnet atau testnet | Rekomendasi mainnet nominal kecil (infrastruktur testnet terbatas). |
| 4 | Persistensi DB wallet | Rekomendasi: terenkripsi di IndexedDB (§8.3). |
| 5 | Tetap pakai Privy? | Ya untuk login (cepat). Alternatif: passkey-only (lebih privat, lebih lama dibuat). |
| 6 | Hosting proxy lightwalletd | ChainSafe (cepat) vs self-host (lebih terkontrol). |

---

## 18. Urutan kerja

Urutan berdasarkan ketergantungan, bukan tanggal. Milestone berikutnya dimulai
setelah kriteria lulus milestone sebelumnya terpenuhi.

| Milestone | Isi | Bergantung pada | Kriteria lulus |
|---|---|---|---|
| M0 | Baca rules, pilih nama, buat repo baru, pilih jaringan | — | Keputusan tercatat |
| M1 | **PoC WebZjs**: build WASM, init di Next.js, uji COOP/COEP vs Privy, akun dari seed, sync, saldo | M0 | Saldo tampil di app; keputusan header dicatat |
| M2 | Kunci (passkey/PIN → seed), onboarding, profil dengan UA bertanda tangan | M1 | Akun baru punya UA terverifikasi |
| M3 | Receive + payment link (ZIP-321), verifikasi signature di halaman bayar | M2 | Bayar dari Zodl masuk dan memo terbaca |
| M4 | Dashboard (saldo, riwayat, sync) + Send ke @username + Cash out | M2 | Kirim dan cash out sukses dari browser |
| M5 | Invoice + deteksi Paid via memo + PDM | M3, M4 | Invoice otomatis Paid |
| M6 | Receipt v1 + `/verify` | M4 | Receipt terverifikasi |
| M7 | PWA, empty state, brand, landing | M2 | Installable, UI konsisten |
| M8 | (P2) Email notifikasi + request antar user | M5 | Email terkirim, request terbayar |
| M9 | (P3) Bayar lintas chain lewat NEAR Intents | M3 | Pembayaran dari chain lain diterima |
| M10 | Deploy (Vercel + Atlas), E2E mainnet nominal kecil | M5 | Link live stabil |
| M11 | Video demo, pitch, README, submit | M10 | Submission terkirim |

M3, M4, M6 dan M7 bisa dikerjakan paralel setelah M2 selesai.

**Prioritas kalau waktu tidak cukup:** potong M9 → M8 → receipt v2 → M7.
**Jangan dipotong:** M1–M6, M10 dan M11.

---

## 19. Kriteria penerimaan (Definition of Done)

- [ ] Pengguna baru tanpa pengalaman crypto bisa onboarding dalam < 1 menit tanpa melihat seed.
- [ ] Payer membayar link atau invoice dari Zodl lewat QR, dan dana muncul di saldo setelah sync.
- [ ] Invoice berubah Paid otomatis dari memo, tanpa server mengetahui nominal atau pengirim.
- [ ] Send ke `@username` dan cash out ke alamat luar sukses dari browser HP.
- [ ] Receipt bisa diverifikasi di `/verify` oleh orang tanpa akun.
- [ ] Test privasi membuktikan tidak ada seed/viewing key di payload server.
- [ ] Live di domain publik, PWA installable, README menjelaskan model privasi dan batasannya.
- [ ] Video demo ≤ 3 menit memperlihatkan alur nyata di mainnet (nominal kecil).

---

## 20. Referensi
- ZECATHON: https://thezecathon.com/
- ChainSafe WebZjs: https://github.com/ChainSafe/WebZjs
- Laporan kelayakan Zcash web: https://research.chainsafe.io/featured/Publications/Zcash-web-feasibility/
- Audit Hacken (WebZjs Snap): https://hacken.io/audits/zcash/dapp-zcash-snap-may2025/
- ZIP-321 (payment request URIs): https://zips.z.cash/zip-0321 · crate `zip321`: https://docs.rs/zip321
- ZIP-32 (HD wallet), ZIP-316 (Unified Addresses), ZIP-317 (fee): https://zips.z.cash/
- Zebra + lightwalletd: https://zebra.zfnd.org/user/lightwalletd.html
- ZecKit (regtest devnet): https://github.com/marketplace/actions/zeckit-devnet
- Zodl (dulu Zashi): https://bitcoinist.com/zashi-becomes-zodl-zcash-wallet/
- NEAR Intents: https://brave.com/blog/near-intents/
