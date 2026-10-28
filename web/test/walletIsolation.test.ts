// @vitest-environment happy-dom
import { describe, expect, it } from "vitest";
import { loadWebZjs } from "../src/lib/zcash/wallet";

describe("loadWebZjs", () => {
  it("explains the missing isolation instead of leaking DataCloneError", async () => {
    await expect(loadWebZjs()).rejects.toThrow(/cross-origin isolated page/);
  });
});
