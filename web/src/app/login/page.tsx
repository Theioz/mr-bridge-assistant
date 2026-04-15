"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import Logo from "@/components/ui/logo";

const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";

type State = "idle" | "loading" | "error";

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const searchParams = useSearchParams();
  const hasAuthError = searchParams.get("error") === "auth_error";
  const router = useRouter();

  async function signIn(e: string, p: string) {
    setState("loading");
    setErrorMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email: e, password: p });
    if (error) {
      setErrorMsg(error.message);
      setState("error");
    } else {
      router.refresh();
      router.push("/");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    await signIn(email, password);
  }

  async function handleDemoLogin() {
    if (!DEMO_EMAIL || !DEMO_PASSWORD) return;
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    await signIn(DEMO_EMAIL, DEMO_PASSWORD);
  }

  const inputStyle: React.CSSProperties = {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    color: "var(--color-text)",
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: "var(--color-bg)" }}
    >
      <div className="w-full max-w-sm space-y-8">
        <div className="flex items-center gap-3">
          <Logo size={36} />
          <div>
            <h1 className="text-2xl font-semibold" style={{ color: "var(--color-text)" }}>Mr. Bridge</h1>
            <p className="mt-0.5 text-sm" style={{ color: "var(--color-text-muted)" }}>Personal assistant</p>
          </div>
        </div>

        {hasAuthError && (
          <div
            className="rounded-lg px-4 py-3 text-sm"
            style={{
              background: "color-mix(in srgb, var(--color-danger) 15%, transparent)",
              border: "1px solid color-mix(in srgb, var(--color-danger) 40%, transparent)",
              color: "var(--color-danger)",
            }}
          >
            Session expired. Please sign in again.
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label htmlFor="email" className="block text-sm mb-1.5" style={{ color: "var(--color-text-muted)" }}>
              Email
            </label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="you@example.com"
              aria-invalid={state === "error"}
              aria-describedby={state === "error" ? "login-error" : undefined}
              className="w-full rounded-lg px-4 py-2.5 text-sm"
              style={inputStyle}
            />
          </div>

          <div>
            <label htmlFor="password" className="block text-sm mb-1.5" style={{ color: "var(--color-text-muted)" }}>
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                placeholder="••••••••"
                aria-invalid={state === "error"}
                aria-describedby={state === "error" ? "login-error" : undefined}
                className="w-full rounded-lg px-4 py-2.5 text-sm"
                style={{ ...inputStyle, paddingRight: 40 }}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                aria-pressed={showPassword}
                className="absolute top-1/2 -translate-y-1/2 right-2 flex items-center justify-center"
                style={{
                  background: "transparent",
                  border: "none",
                  color: "var(--color-text-muted)",
                  cursor: "pointer",
                  padding: 6,
                  borderRadius: 4,
                }}
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {state === "error" && (
            <p id="login-error" role="alert" className="text-sm" style={{ color: "var(--color-danger)" }}>
              {errorMsg || "Invalid email or password."}
            </p>
          )}

          {(() => {
            const emailInvalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
            const pwInvalid = !password.trim();
            const isDisabled = state === "loading" || emailInvalid || pwInvalid;
            const disabledHint = emailInvalid
              ? "Enter a valid email"
              : pwInvalid
                ? "Enter your password"
                : undefined;
            return (
          <button
            type="submit"
            disabled={isDisabled}
            aria-disabled={isDisabled}
            title={isDisabled ? disabledHint : undefined}
            className="w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-opacity cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--color-primary)", color: "#fff" }}
            onMouseEnter={(e) => { if (!(e.currentTarget as HTMLButtonElement).disabled) (e.currentTarget as HTMLElement).style.opacity = "0.9"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLElement).style.opacity = "1"; }}
          >
            {state === "loading" ? "Signing in..." : "Sign in"}
          </button>
            );
          })()}
        </form>

        {DEMO_EMAIL && DEMO_PASSWORD && (
          <div className="pt-2">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full" style={{ borderTop: "1px solid var(--color-border)" }} />
              </div>
              <div className="relative flex justify-center text-xs">
                <span className="px-3" style={{ background: "var(--color-bg)", color: "var(--color-text-faint)" }}>or</span>
              </div>
            </div>
            <button
              onClick={handleDemoLogin}
              disabled={state === "loading"}
              className="mt-4 w-full rounded-lg px-4 py-2.5 text-sm font-medium transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
              style={{
                border: "1px solid var(--color-border)",
                color: "var(--color-text-muted)",
                background: "transparent",
              }}
            >
              Try the demo
            </button>
            <p className="mt-2 text-center text-xs" style={{ color: "var(--color-text-faint)" }}>
              Fictional persona · read-write · resets nightly
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
