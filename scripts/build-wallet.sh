#!/usr/bin/env bash
# Rebuilds the Zcash wallet (webzjs/, Rust → WASM) and installs it into
# packages/webzjs-wallet, which the app loads from web/public/webzjs.
#
# Needs: rustup (the toolchain in webzjs/rust-toolchain.toml installs itself),
# wasm-pack, just, wasm-bindgen-cli 0.2.129 and LLVM (brew install llvm),
# because Apple clang can't target wasm32.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
llvm="$(brew --prefix llvm 2>/dev/null || echo /opt/homebrew/opt/llvm)"
export PATH="$llvm/bin:$HOME/.cargo/bin:$PATH"
export CC_wasm32_unknown_unknown="$llvm/bin/clang"
export AR_wasm32_unknown_unknown="$llvm/bin/llvm-ar"

(cd "$root/webzjs" && just build-wallet)
rm -f "$root/webzjs/packages/webzjs-wallet/.gitignore"
rsync -a --delete --exclude node_modules \
  "$root/webzjs/packages/webzjs-wallet/" "$root/packages/webzjs-wallet/"
node "$root/web/scripts/sync-webzjs.mjs"
echo "Wallet rebuilt into packages/webzjs-wallet."
