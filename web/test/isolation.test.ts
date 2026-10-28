// @vitest-environment happy-dom
import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  ensureCrossOriginIsolation,
  needsCrossOriginIsolation,
} from "../src/lib/isolation";

function setIsolated(value: boolean) {
  Object.defineProperty(window, "crossOriginIsolated", {
    configurable: true,
    value,
  });
}

beforeEach(() => {
  sessionStorage.clear();
  setIsolated(false);
});

describe("needsCrossOriginIsolation", () => {
  it("covers the wallet routes and leaves public pages alone", () => {
    expect(needsCrossOriginIsolation("/dashboard")).toBe(true);
    expect(needsCrossOriginIsolation("/invoices/abc")).toBe(true);
    expect(needsCrossOriginIsolation("/verify")).toBe(true);
    expect(needsCrossOriginIsolation("/claim")).toBe(true);
    expect(needsCrossOriginIsolation("/")).toBe(false);
    expect(needsCrossOriginIsolation("/pay/kopi")).toBe(false);
    expect(needsCrossOriginIsolation("/i/token")).toBe(false);
  });
});

describe("ensureCrossOriginIsolation", () => {
  it("reloads once when the document is not isolated", () => {
    const reload = vi.fn();
    expect(ensureCrossOriginIsolation(reload)).toBe("reloading");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does not reload twice in the same tab", () => {
    const reload = vi.fn();
    ensureCrossOriginIsolation(reload);
    expect(ensureCrossOriginIsolation(reload)).toBe("unavailable");
    expect(reload).toHaveBeenCalledOnce();
  });

  it("does nothing when the document is already isolated", () => {
    setIsolated(true);
    const reload = vi.fn();
    expect(ensureCrossOriginIsolation(reload)).toBe("isolated");
    expect(reload).not.toHaveBeenCalled();
  });

  it("arms the guard again after a successful isolation", () => {
    const reload = vi.fn();
    ensureCrossOriginIsolation(reload);
    setIsolated(true);
    ensureCrossOriginIsolation(reload);
    setIsolated(false);
    expect(ensureCrossOriginIsolation(reload)).toBe("reloading");
    expect(reload).toHaveBeenCalledTimes(2);
  });
});
