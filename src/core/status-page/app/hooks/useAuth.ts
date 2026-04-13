import { useEffect, useState } from "react";

const TOKEN_KEY = "ts-ha-token";

/**
 * Reads the session token from sessionStorage.
 * The token is written there by the login page JS after a successful POST /login.
 * Falls back to a cookie-based approach via the server's login form
 * (sessionStorage is cleared on tab close; the server cookie persists the session).
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

  // hasAuth is true when we have a token in session. If the server requires
  // auth but we have no token here the API calls will get 401 → redirect.
  return { token, hasAuth: token.length > 0 };
}
