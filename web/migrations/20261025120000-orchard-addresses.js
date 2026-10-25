// Receipts name a payment by its Orchard receiver, encoded as an Orchard-only
// unified address, so profiles and pay addresses keep that form (orchardUa)
// next to the full address for the verifier's lookup. New ones get it when
// they're created (lib/zcash/unifiedAddress.ts); this fills in the rest.
// Self-contained on purpose: a migration must not change when app code does.
import { blake2b } from "@noble/hashes/blake2.js";

const CHARSET = "qpzry9x8gf2tvdw0s3jn54khce6mua7l";
const BECH32M = 0x2bc830a3;
const GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];

function polymod(values) {
  let chk = 1;
  for (const v of values) {
    const top = chk >>> 25;
    chk = ((chk & 0x1ffffff) << 5) ^ v;
    for (let i = 0; i < 5; i++) if ((top >>> i) & 1) chk ^= GEN[i];
  }
  return chk;
}

const hrpExpand = (hrp) => {
  const codes = [...hrp].map((c) => c.charCodeAt(0));
  return [...codes.map((c) => c >> 5), 0, ...codes.map((c) => c & 31)];
};

function convertBits(data, from, to, pad) {
  let acc = 0;
  let bits = 0;
  const out = [];
  const max = (1 << to) - 1;
  for (const v of data) {
    acc = (acc << from) | v;
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

const personal = (tag, i, j = 0) =>
  Uint8Array.from(
    [...tag].map((c) => c.charCodeAt(0)).concat([i, j & 255, j >> 8]),
  );
const xor = (a, b) => a.map((v, i) => v ^ b[i]);

function rounds(len) {
  const left = Math.min(64, Math.floor(len / 2));
  const right = len - left;
  const H = (i, u) =>
    blake2b(u, { dkLen: left, personalization: personal("UA_F4Jumble_H", i) });
  const G = (i, u) => {
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

function jumble(m) {
  const { left, H, G } = rounds(m.length);
  const x = xor(m.subarray(left), G(0, m.subarray(0, left)));
  const y = xor(m.subarray(0, left), H(0, x));
  const d = xor(x, G(1, y));
  return Uint8Array.from([...xor(y, H(1, d)), ...d]);
}

function unjumble(m) {
  const { left, H, G } = rounds(m.length);
  const d = m.subarray(left);
  const y = xor(m.subarray(0, left), H(1, d));
  const x = xor(d, G(1, y));
  const a = xor(y, H(0, x));
  return Uint8Array.from([...a, ...xor(x, G(0, a))]);
}

const padding = (hrp) => {
  const pad = new Uint8Array(16);
  pad.set([...hrp].map((c) => c.charCodeAt(0)));
  return pad;
};

/** Same as orchardOnlyAddress() in lib/zcash/unifiedAddress.ts. */
function orchardOnlyAddress(ua) {
  if (typeof ua !== "string" || ua !== ua.toLowerCase()) return null;
  const sep = ua.lastIndexOf("1");
  if (sep < 1) return null;
  const hrp = ua.slice(0, sep);
  const words = [...ua.slice(sep + 1)].map((c) => CHARSET.indexOf(c));
  if (hrp.length > 16 || words.some((w) => w < 0)) return null;
  if (polymod([...hrpExpand(hrp), ...words]) !== BECH32M) return null;
  const bytes = convertBits(words.slice(0, -6), 5, 8, false);
  if (!bytes || bytes.length < 48) return null;
  const raw = unjumble(Uint8Array.from(bytes));
  const body = raw.subarray(0, raw.length - 16);
  const pad = padding(hrp);
  if (!raw.subarray(body.length).every((v, i) => v === pad[i])) return null;
  let orchard = null;
  for (let at = 0; at < body.length; ) {
    const type = body[at++];
    const len = body[at++];
    if (len === undefined || type > 252 || len > 252 || at + len > body.length)
      return null;
    if (type === 3) orchard = body.subarray(at, at + len);
    at += len;
  }
  if (orchard?.length !== 43) return null;
  const out = convertBits(
    jumble(Uint8Array.from([3, 43, ...orchard, ...pad])),
    8,
    5,
    true,
  );
  const mod = polymod([...hrpExpand(hrp), ...out, 0, 0, 0, 0, 0, 0]) ^ BECH32M;
  const checksum = Array.from(
    { length: 6 },
    (_, i) => (mod >>> (5 * (5 - i))) & 31,
  );
  return `${hrp}1${[...out, ...checksum].map((w) => CHARSET[w]).join("")}`;
}

export const up = async (db) => {
  // Profiles keep the address in `ua`, pay addresses in `_id`.
  for (const [name, field] of [
    ["profiles", "ua"],
    ["pay_addresses", "_id"],
  ]) {
    const col = db.collection(name);
    for await (const doc of col.find(
      { orchardUa: { $exists: false } },
      { projection: { [field]: 1 } },
    ))
      await col.updateOne(
        { _id: doc._id },
        { $set: { orchardUa: orchardOnlyAddress(doc[field]) } },
      );
    await col.createIndex(
      { orchardUa: 1 },
      {
        name: "orchard_address",
        partialFilterExpression: { orchardUa: { $type: "string" } },
      },
    );
  }
};

export const down = async (db) => {
  for (const name of ["profiles", "pay_addresses"]) {
    const col = db.collection(name);
    await col.dropIndex("orchard_address").catch(() => {});
    await col.updateMany({}, { $unset: { orchardUa: "" } });
  }
};
