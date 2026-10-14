import { z } from "zod";

const emptyToUndefined = (value: unknown) =>
  typeof value === "string" && value.trim() === "" ? undefined : value;

const optionalString = z.preprocess(
  emptyToUndefined,
  z.string().trim().min(1).optional(),
);

export const publicEnvSchema = z.object({
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
  // "main" = Zcash mainnet, "test" = testnet (also used for local regtest).
  NEXT_PUBLIC_ZCASH_NETWORK: z.preprocess(
    emptyToUndefined,
    z.enum(["main", "test"]).default("main"),
  ),
  // gRPC-web proxy in front of lightwalletd. A plain lightwalletd endpoint
  // does not work from a browser.
  NEXT_PUBLIC_LIGHTWALLETD_URL: z.preprocess(
    emptyToUndefined,
    z.string().trim().url().default("https://zcash-mainnet.chainsafe.dev"),
  ),
  // Explorer link for a transaction; `{txid}` is replaced.
  NEXT_PUBLIC_ZCASH_EXPLORER_TX_URL: optionalString,
  // Confirmations before received funds count as spendable.
  NEXT_PUBLIC_MIN_CONFIRMATIONS: z.preprocess(
    emptyToUndefined,
    z.coerce.number().int().min(1).max(100).default(3),
  ),
  NEXT_PUBLIC_PRIVY_APP_ID: optionalString,
});

/**
 * Keep every public variable as a direct property access. Next.js only embeds
 * NEXT_PUBLIC_* values in browser bundles when it can see this static form.
 */
export function getPublicEnv() {
  return publicEnvSchema.parse({
    NODE_ENV: process.env.NODE_ENV,
    NEXT_PUBLIC_ZCASH_NETWORK: process.env.NEXT_PUBLIC_ZCASH_NETWORK,
    NEXT_PUBLIC_LIGHTWALLETD_URL: process.env.NEXT_PUBLIC_LIGHTWALLETD_URL,
    NEXT_PUBLIC_ZCASH_EXPLORER_TX_URL:
      process.env.NEXT_PUBLIC_ZCASH_EXPLORER_TX_URL,
    NEXT_PUBLIC_MIN_CONFIRMATIONS: process.env.NEXT_PUBLIC_MIN_CONFIRMATIONS,
    NEXT_PUBLIC_PRIVY_APP_ID: process.env.NEXT_PUBLIC_PRIVY_APP_ID,
  });
}

export type PublicEnv = z.infer<typeof publicEnvSchema>;

export const env: PublicEnv = getPublicEnv();
