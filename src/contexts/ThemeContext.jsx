/**
 * ThemeContext — single source of truth for the user's UI theme ("light" | "dark").
 *
 * Behaviour:
 *  - On mount, reads the theme from (in order): the signed-in user object in
 *    sessionStorage → localStorage fallback → "light" default.
 *  - Applies the theme to the <html> element via data-theme so theme.css
 *    overrides take effect everywhere instantly.
 *  - setTheme() persists to localStorage immediately and, when a user is
 *    signed in, fires a PATCH /api/users/{id}/profile to save it server-side
 *    so the choice follows the user across devices/browsers.
 */

import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getSessionUser, mergeSessionUser, patchUserProfile } from "../api/auth";

const STORAGE_KEY = "laboracle_theme";
const ALLOWED = ["light", "dark"];

const ThemeContext = createContext({
  theme: "light",
  setTheme: () => {},
  applyTheme: () => {},
  toggleTheme: () => {},
});

const readInitialTheme = () => {
  try {
    const sessionTheme = getSessionUser()?.theme;
    if (ALLOWED.includes(sessionTheme)) return sessionTheme;
    const stored = localStorage.getItem(STORAGE_KEY);
    if (ALLOWED.includes(stored)) return stored;
  } catch {
    /* private mode / SSR — fall through */
  }
  return "light";
};

const applyToHtml = (theme) => {
  if (typeof document === "undefined") return;
  document.documentElement.setAttribute("data-theme", theme);
};

export const ThemeProvider = ({ children }) => {
  const [theme, setThemeState] = useState(() => {
    const initial = readInitialTheme();
    applyToHtml(initial);
    return initial;
  });

  // Re-sync once on mount in case sessionStorage filled in after first render.
  useEffect(() => {
    const fresh = readInitialTheme();
    if (fresh !== theme) {
      setThemeState(fresh);
      applyToHtml(fresh);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Apply locally only — used right after login/signup when the value already
  // came from the server, so we don't want to PATCH it back.
  const applyTheme = useCallback((next) => {
    if (!ALLOWED.includes(next)) return;
    setThemeState(next);
    applyToHtml(next);
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      /* ignore */
    }
  }, []);

  // Apply locally AND persist to the user's account on the server.
  const setTheme = useCallback(
    async (next) => {
      if (!ALLOWED.includes(next)) return;
      applyTheme(next);
      mergeSessionUser({ theme: next });
      const user = getSessionUser();
      if (user?.id) {
        try {
          await patchUserProfile(user.id, { theme: next });
        } catch {
          // Persisting to the DB is best-effort; the local state stays in sync.
        }
      }
    },
    [applyTheme]
  );

  const toggleTheme = useCallback(() => {
    setTheme(theme === "dark" ? "light" : "dark");
  }, [theme, setTheme]);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, applyTheme, toggleTheme }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => useContext(ThemeContext);
