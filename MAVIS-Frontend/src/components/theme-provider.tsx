"use client";

import { createContext, useContext, useEffect, useState, type ReactNode } from "react";

export type Appearance = "light" | "dark";
type ResolvedAppearance = Appearance;

const STORAGE_KEY = "mavis.appearance";

function isAppearance(value: string | null): value is Appearance {
  return value === "light" || value === "dark";
}

function readAppearance(): Appearance {
  try {
    const value = localStorage.getItem(STORAGE_KEY);
    return isAppearance(value) ? value : "light";
  } catch {
    return "light";
  }
}

function applyAppearance(appearance: Appearance): ResolvedAppearance {
  const resolved = appearance;
  document.documentElement.classList.toggle("dark", resolved === "dark");
  document.documentElement.dataset["appearance"] = appearance;
  document.documentElement.style.colorScheme = resolved;
  return resolved;
}

const AppearanceContext = createContext<{
  appearance: Appearance;
  resolvedAppearance: ResolvedAppearance;
  setAppearance: (appearance: Appearance) => void;
} | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [appearance, setPreference] = useState<Appearance>("light");
  const [resolvedAppearance, setResolved] = useState<ResolvedAppearance>("light");

  useEffect(() => {
    const initial = readAppearance();
    setPreference(initial);
    setResolved(applyAppearance(initial));
    const onStorage = (event: StorageEvent) => {
      if (event.key === STORAGE_KEY || event.key === null) {
        const next = readAppearance();
        setPreference(next);
        setResolved(applyAppearance(next));
      }
    };
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener("storage", onStorage);
    };
  }, []);

  function setAppearance(next: Appearance) {
    setPreference(next);
    setResolved(applyAppearance(next));
    try {
      localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // Appearance still works for this session when storage is unavailable.
    }
  }

  return (
    <AppearanceContext.Provider value={{ appearance, resolvedAppearance, setAppearance }}>
      {children}
    </AppearanceContext.Provider>
  );
}

export function useAppearance() {
  const context = useContext(AppearanceContext);
  if (!context) throw new Error("useAppearance must be used inside ThemeProvider.");
  return context;
}
