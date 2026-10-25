import { hkdf } from "@noble/hashes/hkdf.js";
import { sha256 } from "@noble/hashes/sha2.js";
import { entropyToMnemonic } from "@scure/bip39";
import { wordlist } from "@scure/bip39/wordlists/english";
import { KEY_NS } from "../brand";

const utf8 = (s: string) => new TextEncoder().encode(s);

// The account master (passkey PRF or PIN escrow) is the only root secret.
// Everything below is re-derived on unlock and lives in page memory only.

/** 24-word BIP39 mnemonic for the Zcash wallet (ZIP-32 account 0). */
export function mnemonicFromMaster(master: Uint8Array): string {
  const entropy = hkdf(
    sha256,
    master,
    undefined,
    utf8(`${KEY_NS}.zcash.seed.v1`),
    32,
  );
  try {
    return entropyToMnemonic(entropy, wordlist);
  } finally {
    entropy.fill(0);
  }
}

/** AES-256-GCM key for the wallet database cached in IndexedDB. */
export function walletDbKey(master: Uint8Array): Uint8Array {
  return hkdf(sha256, master, undefined, utf8(`${KEY_NS}.walletdb.v1`), 32);
}

/**
 * AES-256-GCM key for small records kept on this device only (contacts,
 * point-of-sale sales, payments already announced). See lib/vault.ts.
 */
export function localVaultKey(master: Uint8Array): Uint8Array {
  return hkdf(sha256, master, undefined, utf8(`${KEY_NS}.vault.v1`), 32);
}

/** Seed for the Ed25519 key that signs the public profile claim. */
export function profileSigningSeed(master: Uint8Array): Uint8Array {
  return hkdf(sha256, master, undefined, utf8(`${KEY_NS}.profile-sign.v1`), 32);
}

/** X25519 secret for app messages (encrypted payment requests). */
export function messagingSecret(master: Uint8Array): Uint8Array {
  return hkdf(sha256, master, undefined, utf8(`${KEY_NS}.msg.v1`), 32);
}

/**
 * Key of claim link `index` (see features/claims): 32 bytes that become a
 * throwaway wallet's seed. Derived from the master, as ZIP 324 suggests, so a
 * sender who lost the link can still cancel it after recovering the account.
 */
export function claimLinkKey(master: Uint8Array, index: number): Uint8Array {
  return hkdf(
    sha256,
    master,
    undefined,
    utf8(`${KEY_NS}.claim-link.v1:${index}`),
    32,
  );
}
