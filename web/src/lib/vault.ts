import { loadWalletDb, saveWalletDb } from "./zcash/walletStore";

// Small JSON records that must never reach the server (contacts, point-of-
// sale sales, which payments were already announced). Sealed with AES-GCM in
// the same IndexedDB as the wallet cache, under a key derived from the
// account master, so they are unreadable without unlocking.

const utf8 = new TextEncoder();
const fromUtf8 = new TextDecoder();

export async function saveRecord(
  id: string,
  value: unknown,
  key: Uint8Array,
): Promise<void> {
  await saveWalletDb(`vault:${id}`, utf8.encode(JSON.stringify(value)), key);
}

/** The record, or null when missing, corrupt or sealed under another key. */
export async function loadRecord<T>(
  id: string,
  key: Uint8Array,
): Promise<T | null> {
  const bytes = await loadWalletDb(`vault:${id}`, key);
  if (!bytes) return null;
  try {
    return JSON.parse(fromUtf8.decode(bytes)) as T;
  } catch {
    return null;
  }
}
