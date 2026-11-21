"use client";

import { useEffect, useState } from "react";
import { UserRound } from "lucide-react";
import { cn } from "@/lib/utils";

const AVATAR_GRADIENTS = [
  "from-sky-600 to-indigo-600",
  "from-teal-600 to-emerald-600",
  "from-indigo-600 to-violet-600",
  "from-blue-600 to-cyan-600",
  "from-emerald-600 to-teal-700",
  "from-slate-700 to-sky-700",
] as const;

export function getUserInitials(name: string | null | undefined): string {
  const parts = (name ?? "").trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) {
    return `${parts[0]?.charAt(0) ?? ""}${parts.at(-1)?.charAt(0) ?? ""}`.toUpperCase();
  }
  return parts[0]?.slice(0, 2).toUpperCase() ?? "";
}

function pickGradient(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return AVATAR_GRADIENTS[hash % AVATAR_GRADIENTS.length] ?? AVATAR_GRADIENTS[0];
}

const SIZE_CLASSES = {
  xs: "size-6 text-[10px]",
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-16 text-lg",
  xl: "size-24 text-2xl",
} as const;

export function UserAvatar({
  name,
  avatarUrl,
  size = "sm",
  online = false,
  className,
}: {
  name?: string | null | undefined;
  avatarUrl?: string | null | undefined;
  size?: keyof typeof SIZE_CLASSES;
  online?: boolean;
  className?: string;
}) {
  const [broken, setBroken] = useState(false);

  useEffect(() => {
    setBroken(false);
  }, [avatarUrl]);

  const cleanUrl = avatarUrl?.trim() || "";
  const showImage = Boolean(cleanUrl) && !broken;
  const initials = getUserInitials(name);
  const gradient = pickGradient((name ?? cleanUrl) || "mavis");

  return (
    <span
      className={cn(
        "relative inline-flex shrink-0 select-none items-center justify-center rounded-full border border-border/60 font-semibold text-white shadow-xs",
        !showImage && `bg-gradient-to-br ${gradient}`,
        showImage && "bg-muted",
        SIZE_CLASSES[size],
        className,
      )}
    >
      {showImage ? (
        <img
          src={cleanUrl}
          alt={name ? `${name}` : ""}
          referrerPolicy="no-referrer"
          loading="lazy"
          onError={() => setBroken(true)}
          className="size-full rounded-full object-cover"
        />
      ) : initials ? (
        <span aria-hidden="true">{initials}</span>
      ) : (
        <UserRound className="size-1/2" aria-hidden="true" />
      )}
      {online && (
        <span
          aria-hidden="true"
          className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full border-2 border-background bg-emerald-500"
        />
      )}
    </span>
  );
}
