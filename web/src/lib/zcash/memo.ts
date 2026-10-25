import { MEMO_PREFIX } from "../brand";

// App memos tag a payment with what it pays: `zua:<kind>:<id>`. Payers may
// also write free text; anything that isn't a tag is shown as a note.
// "pos" tags a point-of-sale charge; it is never sent to the server.
export type MemoKind = "inv" | "link" | "req" | "tip" | "pos";
export type MemoTag = { kind: MemoKind; id: string };

const KINDS: readonly MemoKind[] = ["inv", "link", "req", "tip", "pos"];
const ID = /^[0-9A-Za-z]{8,24}$/;
export const MAX_MEMO_BYTES = 512;

export function formatMemoTag({ kind, id }: MemoTag): string {
  if (!ID.test(id)) throw new Error("Invalid memo id.");
  return `${MEMO_PREFIX}:${kind}:${id}`;
}

/** Finds an app tag at the start of a memo; trailing text is allowed. */
export function parseMemoTag(memo: string): MemoTag | null {
  const [prefix, kind, rest] = memo.trim().split(":", 3);
  if (prefix !== MEMO_PREFIX || !KINDS.includes(kind as MemoKind) || !rest)
    return null;
  const id = rest.split(/\s/, 1)[0];
  return ID.test(id) ? { kind: kind as MemoKind, id } : null;
}

/** Makes payer-written memo text safe to render as plain text. */
export function sanitizeMemo(memo: string): string {
  return (
    memo
      // biome-ignore lint/suspicious/noControlCharactersInRegex: strip control chars
      .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
      .trim()
      .slice(0, MAX_MEMO_BYTES)
  );
}

export function memoBytes(memo: string): number {
  return new TextEncoder().encode(memo).length;
}

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";

/** Random base62 id for memo tags (12 chars ≈ 71 bits). */
export function newMemoId(length = 12): string {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return Array.from(bytes, (b) => ALPHABET[b % ALPHABET.length]).join("");
}
