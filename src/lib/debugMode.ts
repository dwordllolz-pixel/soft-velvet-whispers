/**
 * Debug mode persistence.
 *
 * Once `?debug=true` appears in the URL, the flag is mirrored into
 * sessionStorage under `debug_overlay` so it survives in-app navigation
 * without re-appending the query param. sessionStorage (not localStorage)
 * is intentional — closing the tab clears it.
 */
const KEY = "debug_overlay";

export function isDebugActive(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get("debug") === "true") {
      window.sessionStorage.setItem(KEY, "1");
      return true;
    }
    return window.sessionStorage.getItem(KEY) === "1";
  } catch {
    return false;
  }
}
