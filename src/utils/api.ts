/**
 * On the web, the frontend and backend are served from the same origin, so
 * relative paths like `/api/carparks` just work. When this app is packaged
 * as a native app (via Capacitor, for iOS/Android), it's loaded from a local
 * file or a custom scheme (e.g. `capacitor://localhost`) — there is no
 * "same origin" to call, so every API request needs an absolute URL
 * pointing at the deployed backend instead.
 *
 * Capacitor injects `window.Capacitor` at runtime in native builds, which
 * is how we detect "we're running as a native app" without needing a
 * separate build flag to remember to set.
 */

// Update this if your Render (or other) backend URL ever changes.
const DEPLOYED_API_BASE_URL = "https://sg-cheap-carpark.onrender.com";

function isNativePlatform(): boolean {
  return typeof window !== "undefined" && !!(window as any).Capacitor?.isNativePlatform?.();
}

/**
 * Prefixes a `/api/...` path with the deployed backend URL when running as
 * a native app, or leaves it relative (as-is) when running on the web.
 *
 * Usage: fetch(apiUrl("/api/carparks"))
 */
export function apiUrl(path: string): string {
  if (isNativePlatform()) {
    return `${DEPLOYED_API_BASE_URL}${path}`;
  }
  return path;
}
