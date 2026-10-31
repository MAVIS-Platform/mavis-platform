"use client";
import { useEffect, useRef, useState } from "react";
import { useApiMutation } from "@/hooks/use-api";
import { ErrorState } from "@/components/shared/request-state";
import type { AppRole } from "@/types/domain";
type GoogleApi = {
  accounts: {
    id: {
      initialize: (config: {
        client_id: string;
        callback: (response: { credential: string }) => void;
      }) => void;
      renderButton: (element: HTMLElement, options: Record<string, unknown>) => void;
      cancel: () => void;
    };
  };
};
export function GoogleSignIn({
  onSignedIn,
}: {
  onSignedIn: (session: { user: { role: AppRole } | null }) => Promise<void>;
}) {
  const container = useRef<HTMLDivElement>(null);
  const callback = useRef(onSignedIn);
  callback.current = onSignedIn;
  const login = useApiMutation("googleSignIn");
  const action = useRef(login);
  const submitting = useRef(false);
  action.current = login;
  const [enabled, setEnabled] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    let script: HTMLScriptElement | undefined;
    const mount = (clientId: string) => {
      if (!live || !container.current) return;
      const google = (window as unknown as { google?: GoogleApi }).google;
      if (!google) {
        setFailed(true);
        return;
      }
      google.accounts.id.initialize({
        client_id: clientId,
        callback: async (response) => {
          if (submitting.current || !live) return;
          submitting.current = true;
          try {
            const session = await action.current.mutateAsync({ idToken: response.credential });
            if (live) await callback.current(session);
          } catch {
            /* Error shown below. */
          } finally {
            submitting.current = false;
          }
        },
      });
      google.accounts.id.renderButton(container.current, {
        theme: "outline",
        size: "large",
        text: "continue_with",
        shape: "pill",
      });
    };
    void fetch("/api/auth-config")
      .then((r) => r.json())
      .then((value: { googleClientId: string | null }) => {
        if (!live || !value.googleClientId) return;
        setEnabled(true);
        if ((window as unknown as { google?: GoogleApi }).google) mount(value.googleClientId);
        else {
          script = document.createElement("script");
          script.src = "https://accounts.google.com/gsi/client";
          script.async = true;
          script.onload = () => mount(value.googleClientId!);
          script.onerror = () => {
            if (live) setFailed(true);
          };
          document.head.appendChild(script);
        }
      })
      .catch(() => {
        if (live) setFailed(true);
      });
    return () => {
      live = false;
      script?.remove();
    };
  }, []);
  return (
    <div hidden={!enabled} className="mt-6 space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        or
        <span className="h-px flex-1 bg-border" />
      </div>
      <div ref={container} className="flex justify-center" />
      {login.isPending && (
        <p role="status" className="text-center text-sm">
          Signing in with Google…
        </p>
      )}
      {login.isError && <ErrorState error={login.error} />}{" "}
      {failed && (
        <p role="alert" className="text-sm text-destructive">
          Google sign-in could not load. Use email sign-in.
        </p>
      )}
    </div>
  );
}
