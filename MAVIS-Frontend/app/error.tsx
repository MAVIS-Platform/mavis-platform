"use client";
import { Button } from "@/components/ui/button";
export default function ErrorBoundary({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <main role="alert" className="mx-auto max-w-lg space-y-4 p-8">
      <h1 className="text-xl font-semibold">This page could not be displayed</h1>
      <p className="text-sm text-muted-foreground">
        An unexpected display error occurred. Try loading the page again.
      </p>
      <Button onClick={reset}>Try again</Button>
    </main>
  );
}
