import { zatToZec, zecToZat } from "./units";

// ZIP-321 payment request URIs (single payment).
// zcash:<address>?amount=<ZEC>&memo=<base64url>&label=..&message=..
export type PaymentRequest = {
  address: string;
  amountZat?: bigint;
  memo?: string;
  label?: string;
  message?: string;
};

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(value: string): string {
  const b64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder("utf-8", { fatal: true }).decode(
    Uint8Array.from(bin, (c) => c.charCodeAt(0)),
  );
}

// ZIP-321 allows only these query characters unescaped.
const qchar = (s: string) =>
  encodeURIComponent(s).replace(
    /[!'()*]/g,
    (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`,
  );

export function buildPaymentUri(req: PaymentRequest): string {
  const params: string[] = [];
  if (req.amountZat !== undefined) {
    if (req.amountZat <= 0n) throw new Error("Amount must be positive.");
    params.push(`amount=${zatToZec(req.amountZat)}`);
  }
  if (req.memo) params.push(`memo=${toBase64Url(req.memo)}`);
  if (req.label) params.push(`label=${qchar(req.label)}`);
  if (req.message) params.push(`message=${qchar(req.message)}`);
  return `zcash:${req.address}${params.length ? `?${params.join("&")}` : ""}`;
}

export function parsePaymentUri(uri: string): PaymentRequest {
  const trimmed = uri.trim();
  if (!/^zcash:/i.test(trimmed)) throw new Error("Not a zcash: payment URI.");
  const [path, query = ""] = trimmed.slice(6).split("?", 2);
  const req: PaymentRequest = { address: decodeURIComponent(path) };
  for (const part of query.split("&").filter(Boolean)) {
    const [key, raw = ""] = part.split("=", 2);
    if (/\.\d+$/.test(key))
      throw new Error("Multi-payment requests are not supported.");
    if (key === "amount") req.amountZat = zecToZat(raw);
    else if (key === "memo") req.memo = fromBase64Url(raw);
    else if (key === "label") req.label = decodeURIComponent(raw);
    else if (key === "message") req.message = decodeURIComponent(raw);
    else if (key.startsWith("req-"))
      throw new Error(`Unsupported required parameter ${key}.`);
  }
  if (!req.address) throw new Error("Payment URI has no address.");
  return req;
}
