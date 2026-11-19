"use client";

import { useEffect, useRef, useState } from "react";
import { LoaderCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useApiMutation } from "@/hooks/use-api";
import { ErrorState } from "@/components/shared/request-state";
import { useLocale } from "@/lib/i18n/locale-context";
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

type AuthConfig = {
  googleClientId: string | null;
  githubClientId: string | null;
};

function GoogleMark() {
  return (
    <svg className="size-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.44a5.5 5.5 0 0 1-2.39 3.61v3h3.87c2.26-2.08 3.57-5.15 3.57-8.64Z"
      />
      <path
        fill="#34A853"
        d="M12 24c3.24 0 5.95-1.07 7.93-2.91l-3.87-3c-1.07.72-2.45 1.14-4.06 1.14-3.12 0-5.77-2.11-6.72-4.95H1.28v3.1A12 12 0 0 0 12 24Z"
      />
      <path
        fill="#FBBC05"
        d="M5.28 14.28A7.2 7.2 0 0 1 4.9 12c0-.79.14-1.56.38-2.28v-3.1H1.28a12 12 0 0 0 0 10.76l4-3.1Z"
      />
      <path
        fill="#EA4335"
        d="M12 4.77c1.76 0 3.34.61 4.58 1.8l3.44-3.44C17.95 1.19 15.24 0 12 0A12 12 0 0 0 1.28 6.62l4 3.1C6.23 6.88 8.88 4.77 12 4.77Z"
      />
    </svg>
  );
}

function GithubMark() {
  return (
    <svg className="size-4 shrink-0 fill-current" viewBox="0 0 24 24" aria-hidden="true">
      <path d="M12 .5C5.65.5.5 5.65.5 12c0 5.08 3.29 9.39 7.86 10.91.57.1.78-.25.78-.55 0-.27-.01-1.16-.02-2.11-3.2.7-3.87-1.36-3.87-1.36-.52-1.33-1.28-1.68-1.28-1.68-1.04-.71.08-.7.08-.7 1.15.08 1.76 1.19 1.76 1.19 1.02 1.75 2.69 1.24 3.35.95.1-.74.4-1.24.73-1.53-2.55-.29-5.23-1.28-5.23-5.68 0-1.25.45-2.28 1.18-3.08-.12-.29-.51-1.46.11-3.04 0 0 .97-.31 3.17 1.18a11.02 11.02 0 0 1 5.78 0c2.2-1.49 3.17-1.18 3.17-1.18.62 1.58.23 2.75.11 3.04.74.8 1.18 1.83 1.18 3.08 0 4.41-2.69 5.39-5.25 5.67.41.36.78 1.06.78 2.14 0 1.55-.01 2.79-.01 3.17 0 .31.21.66.79.55A11.51 11.51 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
    </svg>
  );
}

export function SocialSignIn({
  onSignedIn,
  nextPath,
}: {
  onSignedIn: (session: { user: { role: AppRole } | null }) => Promise<void>;
  nextPath?: string | null;
}) {
  const { t } = useLocale();
  const googleContainer = useRef<HTMLDivElement>(null);
  const callback = useRef(onSignedIn);
  callback.current = onSignedIn;

  const googleLogin = useApiMutation("googleSignIn");
  const action = useRef(googleLogin);
  action.current = googleLogin;

  const submitting = useRef(false);
  const [config, setConfig] = useState<AuthConfig | null>(null);
  const [googleFailed, setGoogleFailed] = useState(false);
  const [githubPending, setGithubPending] = useState(false);

  useEffect(() => {
    let live = true;
    let script: HTMLScriptElement | undefined;

    const mountGoogle = (clientId: string) => {
      if (!live || !googleContainer.current) return;
      const google = (window as unknown as { google?: GoogleApi }).google;
      if (!google) {
        setGoogleFailed(true);
        return;
      }
      googleContainer.current.innerHTML = "";
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
      const isDark = document.documentElement.classList.contains("dark");
      google.accounts.id.renderButton(googleContainer.current, {
        theme: isDark ? "filled_black" : "outline",
        size: "large",
        text: "continue_with",
        shape: "rectangular",
        width: Math.min(360, googleContainer.current.clientWidth || 360),
      });
    };

    void fetch("/api/auth-config")
      .then((r) => r.json())
      .then((value: AuthConfig) => {
        if (!live) return;
        setConfig({
          googleClientId: value.googleClientId ?? null,
          githubClientId: value.githubClientId ?? null,
        });
        if (!value.googleClientId) return;
        if ((window as unknown as { google?: GoogleApi }).google) {
          mountGoogle(value.googleClientId);
        } else {
          script = document.createElement("script");
          script.src = "https://accounts.google.com/gsi/client";
          script.async = true;
          script.onload = () => mountGoogle(value.googleClientId!);
          script.onerror = () => {
            if (live) setGoogleFailed(true);
          };
          document.head.appendChild(script);
        }
      })
      .catch(() => {
        if (live) {
          setConfig({ googleClientId: null, githubClientId: null });
          setGoogleFailed(true);
        }
      });

    return () => {
      live = false;
      script?.remove();
    };
  }, []);

  const githubEnabled = Boolean(config?.githubClientId);
  const googleEnabled = Boolean(config?.googleClientId);
  const githubHref = nextPath
    ? `/api/auth/github/start?next=${encodeURIComponent(nextPath)}`
    : "/api/auth/github/start";

  function startGithub() {
    if (!githubEnabled || githubPending || googleLogin.isPending) return;
    setGithubPending(true);
    window.location.assign(githubHref);
  }

  return (
    <div className="mt-5 space-y-3">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="h-px flex-1 bg-border" />
        <span>{t("Or continue with", "Hoặc tiếp tục với")}</span>
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="space-y-2.5">
        {googleEnabled ? (
          <div ref={googleContainer} className="flex min-h-10 w-full justify-center" />
        ) : (
          <Button
            type="button"
            variant="outline"
            className="h-11 w-full justify-center gap-2.5 text-sm font-medium"
            disabled
            title={t(
              "Set MAVIS_GOOGLE_CLIENT_ID to enable Google sign-in.",
              "Cấu hình MAVIS_GOOGLE_CLIENT_ID để bật đăng nhập Google.",
            )}
          >
            <GoogleMark />
            <span>{t("Continue with Google", "Tiếp tục với Google")}</span>
            {config !== null && (
              <span className="text-xs font-normal text-muted-foreground">
                ({t("Not configured", "Chưa cấu hình")})
              </span>
            )}
          </Button>
        )}

        <Button
          type="button"
          variant="outline"
          className="h-11 w-full justify-center gap-2.5 text-sm font-medium"
          disabled={!githubEnabled || githubPending || googleLogin.isPending}
          onClick={startGithub}
          title={
            githubEnabled
              ? t("Sign in quickly with GitHub", "Đăng nhập nhanh bằng GitHub")
              : t(
                  "Set MAVIS_GITHUB_CLIENT_ID and MAVIS_GITHUB_CLIENT_SECRET to enable GitHub sign-in.",
                  "Cấu hình MAVIS_GITHUB_CLIENT_ID và MAVIS_GITHUB_CLIENT_SECRET để bật đăng nhập GitHub.",
                )
          }
        >
          {githubPending ? <LoaderCircle className="size-4 animate-spin" /> : <GithubMark />}
          <span>
            {githubPending
              ? t("Redirecting to GitHub…", "Đang chuyển đến GitHub…")
              : t("Continue with GitHub", "Tiếp tục với GitHub")}
          </span>
          {config !== null && !githubEnabled && (
            <span className="text-xs font-normal text-muted-foreground">
              ({t("Not configured", "Chưa cấu hình")})
            </span>
          )}
        </Button>
      </div>

      {googleLogin.isPending && (
        <p role="status" className="text-center text-sm text-muted-foreground">
          {t("Signing in with Google…", "Đang đăng nhập bằng Google…")}
        </p>
      )}
      {googleLogin.isError && <ErrorState error={googleLogin.error} />}
      {googleFailed && googleEnabled && (
        <p role="alert" className="text-center text-xs text-destructive">
          {t(
            "Google sign-in could not load. Use GitHub or email sign-in.",
            "Không thể tải nút Google. Hãy dùng GitHub hoặc email.",
          )}
        </p>
      )}
    </div>
  );
}
