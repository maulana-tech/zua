// Minimal gRPC-web client for the two lightwalletd calls the receipt verifier
// needs. Protobuf is encoded by hand: both messages are tiny and this avoids
// pulling a gRPC/protobuf toolchain into the bundle.
//
// Service: cash.z.wallet.sdk.rpc.CompactTxStreamer
//   GetLatestBlock(ChainSpec{}) -> BlockID{ height=1 uint64, hash=2 bytes }
//   GetTransaction(TxFilter{ hash=3 bytes }) -> RawTransaction{ data=1, height=2 }

const SERVICE = "cash.z.wallet.sdk.rpc.CompactTxStreamer";

function frame(message: Uint8Array): Uint8Array {
  const out = new Uint8Array(5 + message.length);
  new DataView(out.buffer).setUint32(1, message.length);
  out.set(message, 5);
  return out;
}

/** First data frame of a gRPC-web response; throws on a grpc-status error. */
function unframe(body: Uint8Array): Uint8Array {
  let offset = 0;
  let data: Uint8Array | null = null;
  while (offset + 5 <= body.length) {
    const flag = body[offset];
    const len = new DataView(
      body.buffer,
      body.byteOffset + offset + 1,
      4,
    ).getUint32(0);
    const chunk = body.subarray(offset + 5, offset + 5 + len);
    if (flag === 0 && !data) data = chunk;
    if (flag & 0x80) {
      const trailers = new TextDecoder().decode(chunk);
      const status = /grpc-status:\s*(\d+)/i.exec(trailers)?.[1];
      if (status && status !== "0") {
        const msg = /grpc-message:\s*(.*)/i.exec(trailers)?.[1]?.trim();
        throw new Error(decodeURIComponent(msg ?? `gRPC status ${status}`));
      }
    }
    offset += 5 + len;
  }
  if (!data) throw new Error("Empty response from lightwalletd.");
  return data;
}

function varint(bytes: Uint8Array, pos: number): [bigint, number] {
  let result = 0n;
  let shift = 0n;
  for (;;) {
    const b = bytes[pos++];
    result |= BigInt(b & 0x7f) << shift;
    if (!(b & 0x80)) return [result, pos];
    shift += 7n;
  }
}

/** Reads varint (wire 0) and length-delimited (wire 2) fields. */
function fields(bytes: Uint8Array): Map<number, bigint | Uint8Array> {
  const out = new Map<number, bigint | Uint8Array>();
  let pos = 0;
  while (pos < bytes.length) {
    const [tag, next] = varint(bytes, pos);
    pos = next;
    const field = Number(tag >> 3n);
    const wire = Number(tag & 7n);
    if (wire === 0) {
      const [v, p] = varint(bytes, pos);
      out.set(field, v);
      pos = p;
    } else if (wire === 2) {
      const [len, p] = varint(bytes, pos);
      out.set(field, bytes.subarray(p, p + Number(len)));
      pos = p + Number(len);
    } else if (wire === 1) pos += 8;
    else if (wire === 5) pos += 4;
    else throw new Error("Unexpected protobuf wire type.");
  }
  return out;
}

async function call(base: string, method: string, message: Uint8Array) {
  const res = await fetch(`${base.replace(/\/$/, "")}/${SERVICE}/${method}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/grpc-web+proto",
      Accept: "application/grpc-web+proto",
      "X-Grpc-Web": "1",
    },
    body: frame(message) as BodyInit,
  });
  if (!res.ok) throw new Error(`lightwalletd returned HTTP ${res.status}.`);
  const status = res.headers.get("grpc-status");
  if (status && status !== "0")
    throw new Error(
      decodeURIComponent(
        res.headers.get("grpc-message") ?? `gRPC status ${status}`,
      ),
    );
  return fields(unframe(new Uint8Array(await res.arrayBuffer())));
}

export async function latestHeight(base: string): Promise<number> {
  const block = await call(base, "GetLatestBlock", new Uint8Array());
  return Number(block.get(1) ?? 0n);
}

/**
 * Fetches a transaction by its display txid (as explorers show it).
 * Returns the raw bytes and mined height, or null if lightwalletd doesn't
 * know it or it isn't mined yet.
 */
export async function rawTransaction(
  base: string,
  txid: string,
): Promise<{ data: Uint8Array; height: number } | null> {
  if (!/^[0-9a-f]{64}$/.test(txid)) throw new Error("Invalid transaction id.");
  // TxFilter.hash is the txid in internal byte order (reversed display hex).
  const hash = Uint8Array.from(txid.match(/../g) ?? [], (h) =>
    Number.parseInt(h, 16),
  ).reverse();
  const message = new Uint8Array(2 + hash.length);
  message[0] = (3 << 3) | 2;
  message[1] = hash.length;
  message.set(hash, 2);
  try {
    const raw = await call(base, "GetTransaction", message);
    const data = raw.get(1);
    const height = raw.get(2);
    return data instanceof Uint8Array &&
      typeof height === "bigint" &&
      height > 0n &&
      height < 2n ** 63n
      ? { data, height: Number(height) }
      : null;
  } catch (e) {
    if (/not found|no such|invalid/i.test(String(e))) return null;
    throw e;
  }
}
