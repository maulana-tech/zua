import type { ZcashNetwork } from "./network";

export type AddressKind = "unified" | "sapling" | "transparent";

// Human-readable prefixes per network (ZIP-316, ZIP-32, base58 t-addrs).
const PREFIXES: Record<ZcashNetwork, Record<AddressKind, RegExp>> = {
  main: {
    unified: /^u1[02-9ac-hj-np-z]{100,}$/,
    sapling: /^zs1[02-9ac-hj-np-z]{75}$/,
    transparent: /^t[13][1-9A-HJ-NP-Za-km-z]{33}$/,
  },
  test: {
    unified: /^utest1[02-9ac-hj-np-z]{100,}$/,
    sapling: /^ztestsapling1[02-9ac-hj-np-z]{75}$/,
    transparent: /^t[m2][1-9A-HJ-NP-Za-km-z]{33}$/,
  },
};

/** Cheap shape check; the wallet does the full checksum/receiver check. */
export function addressKind(
  address: string,
  network: ZcashNetwork,
): AddressKind | null {
  const a = address.trim();
  for (const kind of ["unified", "sapling", "transparent"] as const)
    if (PREFIXES[network][kind].test(a)) return kind;
  return null;
}

export const isShielded = (kind: AddressKind | null) =>
  kind === "unified" || kind === "sapling";
