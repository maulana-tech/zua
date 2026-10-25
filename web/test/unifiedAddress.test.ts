import { describe, expect, it } from "vitest";
import {
  orchardOnlyAddress,
  sameOrchardReceiver,
} from "../src/lib/zcash/unifiedAddress";
import { FULL, ORCHARD_ONLY, OTHER } from "./helpers/unifiedAddresses";

describe("orchardOnlyAddress", () => {
  it("matches the wallet's encoding of the Orchard receiver", () => {
    expect(orchardOnlyAddress(FULL)).toBe(ORCHARD_ONLY);
  });

  it("leaves an Orchard-only address as it is", () => {
    expect(orchardOnlyAddress(ORCHARD_ONLY)).toBe(ORCHARD_ONLY);
    expect(orchardOnlyAddress(OTHER)).toBe(OTHER);
  });

  it("rejects anything that isn't a valid unified address", () => {
    const flipped = `${FULL.slice(0, -1)}${FULL.endsWith("q") ? "p" : "q"}`;
    expect(orchardOnlyAddress(flipped)).toBeNull();
    expect(orchardOnlyAddress(FULL.toUpperCase())).toBeNull();
    expect(orchardOnlyAddress("u1profiledinarxxxxxx")).toBeNull();
    expect(orchardOnlyAddress("")).toBeNull();
  });
});

describe("sameOrchardReceiver", () => {
  it("pairs a full address with its Orchard-only form only", () => {
    expect(sameOrchardReceiver(FULL, ORCHARD_ONLY)).toBe(true);
    expect(sameOrchardReceiver(ORCHARD_ONLY, FULL)).toBe(true);
    expect(sameOrchardReceiver(FULL, OTHER)).toBe(false);
    expect(sameOrchardReceiver("u1x", "u1x")).toBe(false);
  });
});
