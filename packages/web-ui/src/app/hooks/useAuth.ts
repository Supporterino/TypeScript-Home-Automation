import { useEffect, useState } from "react";

const TOKEN_KEY = "ts-ha-token";

/**
 * Reads the session token from sessionStorage; falls back to the server's
 * cookie-based session, since sessionStorage is cleared on tab close.
 */
export function useAuth(basePath: string): { token: string; hasAuth: boolean } {
  const [token, setToken] = useState(() => sessionStorage.getItem(TOKEN_KEY) ?? "");

  // Listen for storage events in case another tab logs in/out
  useEffect(() => {
    function onStorage(e: StorageEvent) {
      if (e.key === TOKEN_KEY) {
        setToken(e.newValue ?? "");
      }
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Without a token, API calls get 401 and redirect.
  return { token, hasAuth: token.length > 0 };
}
