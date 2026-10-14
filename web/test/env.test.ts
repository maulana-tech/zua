import { describe, expect, it } from "vitest";
import { publicEnvSchema } from "../src/env";
import { serverEnvSchema } from "../src/env.server";

describe("environment schemas", () => {
  it("defaults to Zcash mainnet with no proxy override", () => {
    const parsed = publicEnvSchema.parse({ NODE_ENV: "test" });
    expect(parsed.NEXT_PUBLIC_ZCASH_NETWORK).toBe("main");
    // network.ts then picks ChainSafe's proxy for the network.
    expect(parsed.NEXT_PUBLIC_LIGHTWALLETD_URL).toBeUndefined();
    expect(parsed.NEXT_PUBLIC_MIN_CONFIRMATIONS).toBe(3);
  });

  it("parses typed values and rejects malformed ones", () => {
    const parsed = publicEnvSchema.parse({
      NEXT_PUBLIC_ZCASH_NETWORK: "test",
      NEXT_PUBLIC_MIN_CONFIRMATIONS: "10",
      NEXT_PUBLIC_LIGHTWALLETD_URL: "",
    });
    expect(parsed.NEXT_PUBLIC_ZCASH_NETWORK).toBe("test");
    expect(parsed.NEXT_PUBLIC_MIN_CONFIRMATIONS).toBe(10);
    expect(() =>
      publicEnvSchema.parse({ NEXT_PUBLIC_ZCASH_NETWORK: "regtest" }),
    ).toThrow();
    expect(() =>
      publicEnvSchema.parse({ NEXT_PUBLIC_LIGHTWALLETD_URL: "not-a-url" }),
    ).toThrow();
    expect(() =>
      publicEnvSchema.parse({ NEXT_PUBLIC_MIN_CONFIRMATIONS: "0" }),
    ).toThrow();
  });

  it("keeps blank optional secrets absent", () => {
    const parsed = serverEnvSchema.parse({
      NODE_ENV: "test",
      PRIVY_APP_SECRET: "  ",
    });
    expect(parsed.PRIVY_APP_SECRET).toBeUndefined();
  });
});
