"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppearance } from "@/components/theme-provider";

export function AppearanceSelector() {
  const { appearance, setAppearance } = useAppearance();
  const dark = appearance === "dark";
  const Icon = dark ? Moon : Sun;
  return (
    <Button
      variant="ghost"
      size="icon"
      aria-label="Toggle dark mode"
      aria-pressed={dark}
      title={dark ? "Switch to light mode" : "Switch to dark mode"}
      onClick={() => setAppearance(dark ? "light" : "dark")}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
