import { gcm } from "@noble/ciphers/aes.js";
import { randomBytes } from "@noble/hashes/utils.js";

// The serialized wallet database (notes, history, viewing key; never the seed)
// is cached in IndexedDB under AES-256-GCM so a reload resumes the sync
// instead of rescanning from the birthday. Without the key it is unreadable.
const DB = "zcash-wallet";
const STORE = "wallets";

function open(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  try {
    return await new Promise<T>((resolve, reject) => {
      const req = run(db.transaction(STORE, mode).objectStore(STORE));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

export async function saveWalletDb(
  id: string,
  bytes: Uint8Array,
  key: Uint8Array,
): Promise<void> {
  const nonce = randomBytes(12);
  const sealed = gcm(key, nonce).encrypt(bytes);
  const blob = new Uint8Array(12 + sealed.length);
  blob.set(nonce);
  blob.set(sealed, 12);
  await tx("readwrite", (s) => s.put(blob, id));
}

/** Decrypted wallet DB, or null when missing, corrupt or from another key. */
export async function loadWalletDb(
  id: string,
  key: Uint8Array,
): Promise<Uint8Array | null> {
  try {
    const blob = await tx<Uint8Array | undefined>("readonly", (s) => s.get(id));
    if (!blob || blob.length < 29) return null;
    return gcm(key, blob.slice(0, 12)).decrypt(blob.slice(12));
  } catch {
    return null;
  }
}

export async function clearWalletDb(id: string): Promise<void> {
  try {
    await tx("readwrite", (s) => s.delete(id));
  } catch {}
}
