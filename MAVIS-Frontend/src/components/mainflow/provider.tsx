"use client";
// Compatibility wrapper. AppProvider owns the single authenticated query cache.
export function MainflowProvider({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
