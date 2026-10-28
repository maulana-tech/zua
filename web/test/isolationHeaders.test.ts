import { describe, expect, it } from "vitest";
import nextConfig from "../next.config.mjs";

const MAC_SAFARI =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.1 Safari/605.1.15";
const IOS_CHROME =
  "Mozilla/5.0 (iPhone; CPU iPhone OS 18_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/131.0.6778.73 Mobile/15E148 Safari/604.1";
const MAC_CHROME =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Safari/537.36";
const ANDROID_CHROME =
  "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0.0.0 Mobile Safari/537.36";
const MAC_FIREFOX =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10.15; rv:132.0) Gecko/20100101 Firefox/132.0";

type Rule = {
  source: string;
  has?: { type: string; key: string; value: string }[];
  missing?: { type: string; key: string; value: string }[];
  headers: { key: string; value: string }[];
};

async function isolationRules() {
  const rules = (await nextConfig.headers?.()) as Rule[];
  const forDashboard = rules.filter((rule) => rule.source === "/dashboard");
  const coep = (rule: Rule) =>
    rule.headers.find((header) => header.key === "Cross-Origin-Embedder-Policy")
      ?.value;
  return { forDashboard, coep };
}

describe("cross-origin isolation headers", () => {
  it("serves require-corp to WebKit and credentialless everywhere else", async () => {
    const { forDashboard, coep } = await isolationRules();
    expect(forDashboard).toHaveLength(2);

    const webkit = forDashboard.find((rule) => rule.has?.length);
    const others = forDashboard.find((rule) => rule.missing?.length);
    expect(coep(webkit as Rule)).toBe("require-corp");
    expect(coep(others as Rule)).toBe("credentialless");
  });

  it("recognises Safari and iOS browsers, but not Chromium or Firefox", async () => {
    const { forDashboard } = await isolationRules();
    const pattern = new RegExp(
      (forDashboard.find((rule) => rule.has?.length) as Rule).has?.[0]
        .value as string,
    );
    for (const ua of [MAC_SAFARI, IOS_CHROME])
      expect(pattern.test(ua)).toBe(true);
    for (const ua of [MAC_CHROME, ANDROID_CHROME, MAC_FIREFOX])
      expect(pattern.test(ua)).toBe(false);
  });
});
