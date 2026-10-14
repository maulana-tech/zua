import { ed25519 } from "@noble/curves/ed25519.js";
import { bytesToHex, hexToBytes } from "../../lib/crypto";

// Receipt v2: the recipient signs "I received this payment" with their
// profile key and attaches, for each Orchard or Ironwood output they received, that
// output's note encryption key (K_enc). A verifier decrypts just those outputs
// from the on-chain transaction and checks the notes against their
// commitments, so amount and memo are proven by the chain, not just stated.
// K_enc opens one output only; it reveals no viewing key or other payments.
export type ReceiptDisclosure = {
  pool: "orchard" | "ironwood";
  action: number;
  kEnc: string;
};

export type ReceiptBody = {
  v: 2;
  network: "main" | "test";
  txid: string; // display order, as explorers show it
  height: number;
  amountZat: string;
  memo: string;
  recipient: { username: string; ua: string };
  disclosures: ReceiptDisclosure[];
  issuedAt: string;
};

export type Receipt = ReceiptBody & { sigHex: string };

export function canonicalReceipt(body: ReceiptBody): string {
  const {
    v,
    network,
    txid,
    height,
    amountZat,
    memo,
    recipient,
    disclosures,
    issuedAt,
  } = body;
  return JSON.stringify({
    v,
    network,
    txid,
    height,
    amountZat,
    memo,
    recipient: { username: recipient.username, ua: recipient.ua },
    disclosures: disclosures.map(({ pool, action, kEnc }) => ({
      pool,
      action,
      kEnc,
    })),
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
    data?.v !== 2 ||
    !/^[0-9a-f]{64}$/.test(data.txid ?? "") ||
    !Number.isInteger(data.height) ||
    !/^\d+$/.test(data.amountZat ?? "") ||
    typeof data.recipient?.username !== "string" ||
    typeof data.recipient?.ua !== "string" ||
    !Array.isArray(data.disclosures) ||
    data.disclosures.length === 0 ||
    data.disclosures.length > 16 ||
    !data.disclosures.every(
      (d) =>
        (d?.pool === "orchard" || d?.pool === "ironwood") &&
        Number.isInteger(d.action) &&
        d.action >= 0 &&
        /^[0-9a-f]{64}$/.test(d.kEnc ?? ""),
    ) ||
    !/^[0-9a-f]{128}$/.test(data.sigHex ?? "")
  )
    throw new Error("This file isn't a valid receipt.");
  return data;
}
