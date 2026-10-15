import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes } from "../../lib/crypto";

// Receipt v3: a signed list of shielded payments, each with the note
// encryption key (K_enc) of the outputs it covers. A verifier decrypts just
// those outputs from the on-chain transactions and checks each note against
// its commitment, so amounts and memos are proven by the chain. K_enc opens
// one output only: no viewing key, balance or other payment is revealed.
//
// - "received": the signer received the payments (recipient's receipt).
// - "sent": the signer paid them (payer's proof of payment). The sender can
//   recover K_enc with their outgoing viewing key.
// - "statement": every payment the signer received in a period, with a total
//   (for an accountant or a tax filing).
export type ReceiptKind = "received" | "sent" | "statement";

export type ReceiptDisclosure = {
  pool: "orchard" | "ironwood";
  action: number;
  kEnc: string;
};

export type ReceiptItem = {
  txid: string; // display order, as explorers show it
  height: number;
  amountZat: string;
  memo: string;
  /** Address the disclosed outputs pay (may be a per-invoice address). */
  recipientUa: string;
  disclosures: ReceiptDisclosure[];
};

export type ReceiptBody = {
  v: 3;
  kind: ReceiptKind;
  network: "main" | "test";
  /** Username whose profile key signs. Recipient, or payer for "sent". */
  signer: string;
  period: { from: string; to: string } | null; // YYYY-MM-DD, statements
  items: ReceiptItem[];
  totalZat: string;
  issuedAt: string;
};

export type Receipt = ReceiptBody & { sigHex: string };

const MAX_ITEMS = 500;

/** Fixed field order, no whitespace: the exact bytes that get signed. */
export function canonicalReceipt(body: ReceiptBody): string {
  return JSON.stringify({
    v: body.v,
    kind: body.kind,
    network: body.network,
    signer: body.signer,
    period: body.period ? { from: body.period.from, to: body.period.to } : null,
    items: body.items.map((i) => ({
      txid: i.txid,
      height: i.height,
      amountZat: i.amountZat,
      memo: i.memo,
      recipientUa: i.recipientUa,
      disclosures: i.disclosures.map((d) => ({
        pool: d.pool,
        action: d.action,
        kEnc: d.kEnc,
      })),
    })),
    totalZat: body.totalZat,
    issuedAt: body.issuedAt,
  });
}

const encode = (s: string) => new TextEncoder().encode(s);

export function signReceipt(body: ReceiptBody, seed: Uint8Array): Receipt {
  return {
    ...body,
    sigHex: bytesToHex(ed25519.sign(encode(canonicalReceipt(body)), seed)),
  };
}

export function receiptSignatureValid(
  receipt: Receipt,
  signPubkeyHex: string,
): boolean {
  try {
    const { sigHex, ...body } = receipt;
    return ed25519.verify(
      hexToBytes(sigHex),
      encode(canonicalReceipt(body)),
      hexToBytes(signPubkeyHex),
    );
  } catch {
    return false;
  }
}

export const sumZat = (items: { amountZat: string }[]) =>
  items.reduce((t, i) => t + BigInt(i.amountZat), 0n).toString();

const isDay = (v: unknown) =>
  typeof v === "string" && /^\d{4}-\d{2}-\d{2}$/.test(v);

function validItem(i: ReceiptItem): boolean {
  return (
    /^[0-9a-f]{64}$/.test(i?.txid ?? "") &&
    Number.isInteger(i.height) &&
    i.height > 0 &&
    /^\d{1,17}$/.test(i.amountZat ?? "") &&
    typeof i.memo === "string" &&
    typeof i.recipientUa === "string" &&
    i.recipientUa.length > 10 &&
    Array.isArray(i.disclosures) &&
    i.disclosures.length > 0 &&
    i.disclosures.length <= 16 &&
    i.disclosures.every(
      (d) =>
        (d?.pool === "orchard" || d?.pool === "ironwood") &&
        Number.isInteger(d.action) &&
        d.action >= 0 &&
        /^[0-9a-f]{64}$/.test(d.kEnc ?? ""),
    )
  );
}

/** Parses untrusted JSON into a receipt shape, or throws a readable error. */
export function parseReceipt(text: string): Receipt {
  let data: Receipt;
  try {
    data = JSON.parse(text) as Receipt;
  } catch {
    throw new Error("This file isn't a receipt (invalid JSON).");
  }
  if (
    data?.v !== 3 ||
    !["received", "sent", "statement"].includes(data.kind) ||
    (data.network !== "main" && data.network !== "test") ||
    typeof data.signer !== "string" ||
    !Array.isArray(data.items) ||
    data.items.length === 0 ||
    data.items.length > MAX_ITEMS ||
    !data.items.every(validItem) ||
    (data.kind === "statement"
      ? !isDay(data.period?.from) || !isDay(data.period?.to)
      : data.period !== null) ||
    !/^\d{1,17}$/.test(data.totalZat ?? "") ||
    sumZat(data.items) !== data.totalZat ||
    !/^[0-9a-f]{128}$/.test(data.sigHex ?? "")
  )
    throw new Error("This file isn't a valid receipt.");
  return data;
}

export function receiptFilename(receipt: ReceiptBody): string {
  if (receipt.kind === "statement" && receipt.period)
    return `zua-statement-${receipt.period.from}-to-${receipt.period.to}.json`;
  const tx = receipt.items[0]?.txid.slice(0, 12) ?? "payment";
  return `zua-${receipt.kind === "sent" ? "payment-proof" : "receipt"}-${tx}.json`;
}

/** CSV of a statement or receipt, for spreadsheets. Amounts in ZEC. */
export function receiptCsv(receipt: ReceiptBody): string {
  const zec = (zat: string) => {
    const v = BigInt(zat);
    return `${v / 100_000_000n}.${(v % 100_000_000n).toString().padStart(8, "0")}`;
  };
  const cell = (s: string) => `"${s.replaceAll('"', '""')}"`;
  const rows = receipt.items.map((i) =>
    [i.txid, String(i.height), zec(i.amountZat), cell(i.memo)].join(","),
  );
  return [
    "txid,block,amount_zec,memo",
    ...rows,
    `total,,${zec(receipt.totalZat)},`,
  ].join("\n");
}
