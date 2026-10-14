# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

Zua is a shielded ZEC payments app on Zcash. Users get a @username, payment links and invoices that any Zcash wallet can pay (ZIP-321 QR codes). The wallet runs in the browser (WebZjs, WASM); keys derive from a passkey or PIN and never leave the page. See `README.md` for the product/privacy model and `docs/superpowers/` for the migration plan and design spec.

## Commands

pnpm workspace (`web`, `packages/*`).

```sh
pnpm install
pnpm dev                                  # Next.js on :3000
pnpm --filter web test                    # vitest run
pnpm --filter web exec vitest run test/zcashLib.test.ts   # single test file
pnpm --filter web exec vitest run -t "name"               # single test by name
pnpm --filter web biome:check             # biome lint+format check (biome:fix to apply)
pnpm --filter web exec tsc --noEmit       # typecheck
pnpm --filter web build
pnpm --filter web migrate:up              # migrate-mongo, reads web/.env.local (also migrate:status/down/create)
```

## Architecture

### Zcash wallet (client)
- `packages/webzjs-wallet/` is a prebuilt WASM package (~60 MB) from our WebZjs fork (branch `zua/nu63`): released NU6.3 crates (Ironwood), `zcash_client_sqlite` on sqlite-wasm-rs, memos, payment disclosure. Don't hand-edit; rebuild from source (see README). `web/scripts/sync-webzjs.mjs` (pre-dev/build) copies it to `web/public/webzjs`, where it is loaded unbundled.
- `web/src/lib/zcash/`: `wallet.ts` (WebZjs wrapper: open/sync/status/history/send, init once per page), `seed.ts` (master → BIP39 seed, wallet-DB key, profile signing seed via HKDF with `KEY_NS`), `zip321.ts`, `memo.ts` (`zua:<kind>:<id>` tags), `units.ts` (zatoshi), `address.ts`, `walletStore.ts` (AES-GCM wallet DB cache in IndexedDB).
- `web/src/components/WalletProvider.tsx` owns the session: Privy login → passkey/PIN unlock → master in a ref → wallet open + periodic sync → invoice settlement (`features/invoices/settle.ts`). Seeds, masters and viewing keys stay in page memory; never send them to the server or persist them unencrypted.
- `web/src/lib/brand.ts` holds `APP_NAME`, `KEY_NS` and `MEMO_PREFIX`. Changing `KEY_NS` after launch changes every user's wallet.
- Threads need cross-origin isolation: `next.config.mjs` sets COOP/COEP on the signed-in app routes only (login stays on unisolated pages); without isolation the wallet proves on one thread.

### Server
- tRPC `appRouter` in `src/server/root.ts`; modules in `src/server/modules/<name>/` split into `*.router.ts` (maps domain errors → `TRPCError`), `*.service.ts`, `*.schema.ts`, `*.errors.ts`. Modules: `accounts` (PIN escrow, passkey record), `profiles` (signed @username → UA claims, verified with `lib/profileClaim.ts`), `paymentLinks`, `invoices` (status reported by the owner's wallet), `notifications`.
- `protectedProcedure` requires a verified Privy access token (Bearer header or `privy-token` cookie, see `context.ts`). Privy is login only (embedded wallets off).
- Env: public vars in `src/env.ts` (`NEXT_PUBLIC_*`), server-only in `src/env.server.ts`. Add new vars to the zod schema and `web/.env.example`.
- MongoDB schema changes go in `web/migrations/` (ESM migrate-mongo). `MONGODB_URI` must include a database name.
- Auth routing: `web/src/middleware.ts` + `src/lib/auth-routes.ts` gate the app routes on Privy cookies.

### Tests (`web/test`)
Vitest, `node` environment by default; component tests use `// @vitest-environment happy-dom`. `server-only` is stubbed; `@` aliases `web/src`.

## Conventions
- Formatting: Biome (2-space, double quotes, organized imports).
- Commit messages in Indonesian, short and imperative, no co-author trailer.
- The repo has no git remote right now; commit locally and don't push unless asked.
