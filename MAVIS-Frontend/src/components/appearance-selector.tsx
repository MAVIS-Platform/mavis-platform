"use client";

import { Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppearance } from "@/components/theme-provider";
import { useLocale } from "@/lib/i18n/locale-context";

export function AppearanceSelector() {
  const { appearance, setAppearance } = useAppearance();
  const { t } = useLocale();
  const dark = appearance === "dark";
  const Icon = dark ? Moon : Sun;
  const label = dark
    ? t("Switch to light theme", "Chuyển sang giao diện sáng")
    : t("Switch to dark theme", "Chuyển sang giao diện tối");
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label={label}
      title={label}
      onClick={() => setAppearance(dark ? "light" : "dark")}
    >
      <Icon aria-hidden="true" />
    </Button>
  );
}
