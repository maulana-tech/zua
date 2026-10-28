import { isProtectedRoute } from "./auth-routes";

/** Public pages are intentionally not isolated; these are the ones that need it. */
export function needsCrossOriginIsolation(pathname: string): boolean {
  return (
    isProtectedRoute(pathname) ||
    pathname === "/verify" ||
    pathname.startsWith("/verify/") ||
    pathname === "/claim" ||
    pathname.startsWith("/claim/")
  );
}

const RELOADED_KEY = "zua:isolation-reload";

/**
 * Opening an app page with client-side navigation keeps the login page's
 * document, which is not cross-origin isolated: the wallet then has no
 * SharedArrayBuffer, and calls that cross a worker boundary fail with
 * "The object can not be cloned". Reload once so the server's COOP/COEP
 * headers apply to the document.
 *
 * The session flag stops a reload loop on hosts whose proxy strips those
 * headers; there the wallet still runs, just on a single thread.
 */
export function ensureCrossOriginIsolation(
  reload: () => void = () => window.location.reload(),
): "isolated" | "reloading" | "unavailable" {
  try {
    if (window.crossOriginIsolated) {
      sessionStorage.removeItem(RELOADED_KEY);
      return "isolated";
    }
    if (sessionStorage.getItem(RELOADED_KEY) === "1") return "unavailable";
    sessionStorage.setItem(RELOADED_KEY, "1");
    reload();
    return "reloading";
  } catch {
    // No storage (private mode, blocked cookies): do not risk a reload loop.
    return "unavailable";
  }
}
