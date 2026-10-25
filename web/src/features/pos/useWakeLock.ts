"use client";

import { useEffect } from "react";

/**
 * Keeps the screen on while `active` (a counter waiting on a customer).
 * Browsers drop the lock when the tab hides, so it is taken again on return.
 */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;
    let lock: WakeLockSentinel | null = null;
    let stopped = false;
    const acquire = async () => {
      if (document.visibilityState !== "visible" || lock) return;
      try {
        const next = await navigator.wakeLock.request("screen");
        if (stopped) void next.release();
        else {
          lock = next;
          next.addEventListener("release", () => {
            if (lock === next) lock = null;
          });
        }
      } catch {
        // denied (battery saver, no user gesture yet): the screen may dim
      }
    };
    void acquire();
    document.addEventListener("visibilitychange", acquire);
    return () => {
      stopped = true;
      document.removeEventListener("visibilitychange", acquire);
      void lock?.release();
    };
  }, [active]);
}
