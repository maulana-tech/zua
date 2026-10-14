import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes } from "../../lib/crypto";

// Receipt v1: the recipient states "I received this payment" and signs it
// with their profile key. A verifier checks the signature against the
// recipient's published profile and that the transaction is on chain. It does
// not prove the shielded amount (that would need a viewing key).
export type ReceiptBody = {
  v: 1;
  network: "main" | "test";
  txid: string; // display order, as explorers show it
  height: number;
  amountZat: string;
  memo: string;
  recipient: { username: string; ua: string };
  issuedAt: string;
};

export type Receipt = ReceiptBody & { sigHex: string };

export function canonicalReceipt(body: ReceiptBody): string {
  const { v, network, txid, height, amountZat, memo, recipient, issuedAt } =
    body;
  return JSON.stringify({
    v,
    network,
    txid,
    height,
    amountZat,
    memo,
    recipient: { username: recipient.username, ua: recipient.ua },
    issuedAt,
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

/** Parses untrusted JSON into a receipt shape, or throws a readable error. */
export function parseReceipt(text: string): Receipt {
  let data: Receipt;
  try {
    data = JSON.parse(text) as Receipt;
  } catch {
    throw new Error("This file isn't a receipt (invalid JSON).");
  }
  if (
    data?.v !== 1 ||
    !/^[0-9a-f]{64}$/.test(data.txid ?? "") ||
    !Number.isInteger(data.height) ||
    !/^\d+$/.test(data.amountZat ?? "") ||
    typeof data.recipient?.username !== "string" ||
    typeof data.recipient?.ua !== "string" ||
    !/^[0-9a-f]{128}$/.test(data.sigHex ?? "")
  )
    throw new Error("This file isn't a valid receipt.");
  return data;
}
