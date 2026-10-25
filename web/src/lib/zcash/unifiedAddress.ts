import { blake2b } from "@noble/hashes/blake2.js";

// Unified address (ZIP-316) decoding, just enough to compare receivers. A
// payment to someone's full address (Sapling + Orchard receivers) lands in an
// Orchard-shaped output, and what a wallet can say about that output is its
// Orchard receiver, encoded as an Orchard-only address. Both name the same
// account, so receipts and lookups compare that form.

const ORCHARD = 3;
const PAD = 16;
const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32M = 0x2bc830a3;
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values: number[]): number {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

const hrpExpand = (hrp: string) => {
  const codes = [...hrp].map((c) => c.charCodeAt(0));
  return [...codes.map((c) => c >> 5), 0, ...codes.map((c) => c & 31)];
};

function convertBits(
  data: ArrayLike<number>,
  from: number,
  to: number,
  pad: boolean,
): number[] | null {
  let acc = 0;
  let bits = 0;
  const out: number[] = [];
  const max = (1 << to) - 1;
  for (let i = 0; i < data.length; i++) {
    acc = (acc << from) | data[i];
    bits += from;
    while (bits >= to) {
      bits -= to;
      out.push((acc >> bits) & max);
    }
    acc &= (1 << bits) - 1;
  }
  if (pad) {
    if (bits) out.push((acc << (to - bits)) & max);
  } else if (bits >= from || acc) return null;
  return out;
}

function bech32mDecode(s: string): { hrp: string; data: Uint8Array } | null {
  if (s !== s.toLowerCase()) return null;
  const sep = s.lastIndexOf("1");
  if (sep < 1 || s.length - sep < 7) return null;
  const hrp = s.slice(0, sep);
  const words: number[] = [];
  for (const c of s.slice(sep + 1)) {
    const v = CHARSET.indexOf(c);
    if (v < 0) return null;
    words.push(v);
  }
  if (polymod([...hrpExpand(hrp), ...words]) !== BECH32M) return null;
  const bytes = convertBits(words.slice(0, -6), 5, 8, false);
  return bytes ? { hrp, data: Uint8Array.from(bytes) } : null;
}

function bech32mEncode(hrp: string, data: Uint8Array): string {
  const words = convertBits(data, 8, 5, true) ?? [];
  const mod =
    polymod([...hrpExpand(hrp), ...words, 0, 0, 0, 0, 0, 0]) ^ BECH32M;
  const checksum = Array.from(
    { length: 6 },
    (_, i) => (mod >>> (5 * (5 - i))) & 31,
  );
  return `${hrp}1${[...words, ...checksum].map((w) => CHARSET[w]).join("")}`;
}

const personal = (tag: string, i: number, j = 0) =>
  Uint8Array.from(
    [...tag].map((c) => c.charCodeAt(0)).concat([i, j & 255, j >> 8]),
  );

const xor = (a: Uint8Array, b: Uint8Array) => a.map((v, i) => v ^ b[i]);

/** F4Jumble's two halves (ZIP-316): H keyed on the right, G on the left. */
function rounds(len: number) {
  const left = Math.min(64, Math.floor(len / 2));
  const right = len - left;
  const H = (i: number, u: Uint8Array) =>
    blake2b(u, { dkLen: left, personalization: personal("UA_F4Jumble_H", i) });
  const G = (i: number, u: Uint8Array) => {
    const out = new Uint8Array(right);
    for (let j = 0; j * 64 < right; j++)
      out.set(
        blake2b(u, {
          dkLen: 64,
          personalization: personal("UA_F4Jumble_G", i, j),
        }).subarray(0, Math.min(64, right - j * 64)),
        j * 64,
      );
    return out;
  };
  return { left, H, G };
}

function jumble(m: Uint8Array): Uint8Array {
  const { left, H, G } = rounds(m.length);
  const x = xor(m.subarray(left), G(0, m.subarray(0, left)));
  const y = xor(m.subarray(0, left), H(0, x));
  const d = xor(x, G(1, y));
  const c = xor(y, H(1, d));
  return Uint8Array.from([...c, ...d]);
}

function unjumble(m: Uint8Array): Uint8Array {
  const { left, H, G } = rounds(m.length);
  const d = m.subarray(left);
  const y = xor(m.subarray(0, left), H(1, d));
  const x = xor(d, G(1, y));
  const a = xor(y, H(0, x));
  const b = xor(x, G(0, a));
  return Uint8Array.from([...a, ...b]);
}

const padding = (hrp: string) => {
  const pad = new Uint8Array(PAD);
  pad.set([...hrp].map((c) => c.charCodeAt(0)));
  return pad;
};

/** Receivers of a unified address by typecode, or null if it isn't one. */
function receivers(
  ua: string,
): { hrp: string; byType: Map<number, Uint8Array> } | null {
  const decoded = bech32mDecode(ua);
  if (!decoded || decoded.hrp.length > PAD || decoded.data.length < 48)
    return null;
  const raw = unjumble(decoded.data);
  const body = raw.subarray(0, raw.length - PAD);
  if (!raw.subarray(body.length).every((v, i) => v === padding(decoded.hrp)[i]))
    return null;
  const byType = new Map<number, Uint8Array>();
  let at = 0;
  while (at < body.length) {
    const type = body[at++];
    const len = body[at++];
    // Typecodes and lengths above 252 would be multi-byte; none exist.
    if (type === undefined || len === undefined || type > 252 || len > 252)
      return null;
    if (at + len > body.length) return null;
    byType.set(type, body.subarray(at, at + len));
    at += len;
  }
  return { hrp: decoded.hrp, byType };
}

/**
 * The Orchard-only form of a unified address (same Orchard receiver), or
 * null when it isn't a unified address with an Orchard receiver.
 */
export function orchardOnlyAddress(ua: string): string | null {
  const parsed = receivers(ua.trim());
  const orchard = parsed?.byType.get(ORCHARD);
  if (!parsed || orchard?.length !== 43) return null;
  const raw = Uint8Array.from([
    ORCHARD,
    orchard.length,
    ...orchard,
    ...padding(parsed.hrp),
  ]);
  return bech32mEncode(parsed.hrp, jumble(raw));
}

/** Whether two unified addresses share their Orchard receiver. */
export function sameOrchardReceiver(a: string, b: string): boolean {
  const x = orchardOnlyAddress(a);
  return x !== null && x === orchardOnlyAddress(b);
}
