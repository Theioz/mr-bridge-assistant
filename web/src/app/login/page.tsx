"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import Logo from "@/components/ui/logo";

const DEMO_EMAIL = process.env.NEXT_PUBLIC_DEMO_EMAIL ?? "";
const DEMO_PASSWORD = process.env.NEXT_PUBLIC_DEMO_PASSWORD ?? "";

type Mode = "signin" | "signup" | "forgot";
type State = "idle" | "loading" | "error" | "pending";

function ModeLink({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        background: "none",
        border: "none",
        color: "var(--accent-text)",
        cursor: "pointer",
        fontSize: "inherit",
        fontWeight: 500,
        padding: "0 2px",
        height: 44,
        display: "inline-flex",
        alignItems: "center",
      }}
    >
      {children}
    </button>
  );
}

function LoginForm() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [mode, setMode] = useState<Mode>("signin");
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const searchParams = useSearchParams();
  const hasAuthError = searchParams.get("error") === "auth_error";
  const nextParam = searchParams.get("next");
  const redirectTo =
    nextParam && nextParam.startsWith("/") && !nextParam.startsWith("//")
      ? nextParam
      : "/dashboard";
  const router = useRouter();

  function switchMode(next: Mode) {
    setMode(next);
    setState("idle");
    setErrorMsg("");
    setConfirmPassword("");
  }

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
      router.push(redirectTo);
    }
  }

  async function signUp(e: string, p: string) {
    setState("loading");
    setErrorMsg("");
    const supabase = createClient();
    const { data, error } = await supabase.auth.signUp({ email: e, password: p });
    if (error) {
      setErrorMsg(error.message);
      setState("error");
    } else if (!data.session) {
      setState("pending");
    } else {
      router.refresh();
      router.push(redirectTo);
    }
  }

  async function sendResetEmail(e: string) {
    setState("loading");
    setErrorMsg("");
    const supabase = createClient();
    const origin = window.location.origin;
    const { error } = await supabase.auth.resetPasswordForEmail(e, {
      redirectTo: `${origin}/auth/callback?next=/reset-password`,
    });
    if (error) {
      setErrorMsg(error.message);
      setState("error");
    } else {
      setState("pending");
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (mode === "signup") {
      if (password !== confirmPassword) {
        setErrorMsg("Passwords do not match.");
        setState("error");
        return;
      }
      await signUp(email, password);
    } else if (mode === "forgot") {
      await sendResetEmail(email);
    } else {
      await signIn(email, password);
    }
  }

  async function handleDemoLogin() {
    if (!DEMO_EMAIL || !DEMO_PASSWORD) return;
    setEmail(DEMO_EMAIL);
    setPassword(DEMO_PASSWORD);
    await signIn(DEMO_EMAIL, DEMO_PASSWORD);
  }

  const inputStyle: React.CSSProperties = {
    background: "transparent",
    border: "1px solid var(--rule)",
    borderRadius: "var(--r-1)",
    color: "var(--color-text)",
    fontSize: "var(--t-body)",
    padding: "0 var(--space-3)",
    minHeight: 44,
    width: "100%",
    transition: "border-color var(--motion-fast) var(--ease-out-quart)",
  };

  const labelStyle: React.CSSProperties = {
    display: "block",
    fontSize: "var(--t-micro)",
    fontWeight: 500,
    color: "var(--color-text)",
    letterSpacing: "0.02em",
    marginBottom: "var(--space-2)",
  };

  const emailInvalid = !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
  const pwInvalid = !password.trim();
  const confirmInvalid = mode === "signup" && confirmPassword !== password;
  const submitDisabled =
    state === "loading" ||
    state === "pending" ||
    emailInvalid ||
    (mode !== "forgot" && pwInvalid) ||
    confirmInvalid;

  const disabledHint = emailInvalid
    ? "Enter a valid email"
    : mode !== "forgot" && pwInvalid
      ? "Enter your password"
      : confirmInvalid
        ? "Passwords must match"
        : undefined;

  const submitLabel =
    state === "loading"
      ? "…"
      : mode === "signup"
        ? "Create account"
        : mode === "forgot"
          ? "Send reset link"
          : "Sign in";

  const subtitle =
    mode === "signup"
      ? "Create your account"
      : mode === "forgot"
        ? "Reset your password"
        : "Personal assistant";

  return (
    <div
      className="min-h-screen flex items-center justify-center"
      style={{ padding: "var(--space-5)" }}
    >
      <div
        className="w-full"
        style={{
          maxWidth: 360,
          display: "flex",
          flexDirection: "column",
          gap: "var(--space-7)",
        }}
      >
        <header
          style={{
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            gap: "var(--space-3)",
            textAlign: "center",
          }}
        >
          <Logo size={40} />
          <h1
            className="font-heading"
            style={{
              fontSize: "var(--t-h1)",
              fontWeight: 600,
              letterSpacing: "-0.02em",
              color: "var(--color-text)",
              lineHeight: 1.1,
              margin: 0,
            }}
          >
            Mr. Bridge
          </h1>
          <p
            style={{
              fontSize: "var(--t-meta)",
              color: "var(--color-text-muted)",
              margin: 0,
            }}
          >
            {subtitle}
          </p>
        </header>

        {hasAuthError && (
          <p
            role="status"
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-danger)",
              textAlign: "center",
              margin: 0,
              paddingTop: "var(--space-2)",
              paddingBottom: "var(--space-2)",
              borderTop: "1px solid var(--color-danger)",
              borderBottom: "1px solid var(--color-danger)",
            }}
          >
            Session expired. Please sign in again.
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
        >
          <div>
            <label htmlFor="email" style={labelStyle}>
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
              className="focus:outline-none input-focus-ring"
              style={inputStyle}
            />
          </div>

          {mode !== "forgot" && (
            <div>
              <label htmlFor="password" style={labelStyle}>
                Password
              </label>
              <div style={{ position: "relative" }}>
                <input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  placeholder="••••••••"
                  aria-invalid={state === "error"}
                  aria-describedby={state === "error" ? "login-error" : undefined}
                  className="focus:outline-none input-focus-ring"
                  style={{ ...inputStyle, paddingRight: 44 }}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? "Hide password" : "Show password"}
                  aria-pressed={showPassword}
                  className="hover-text-brighten"
                  style={{
                    position: "absolute",
                    top: "50%",
                    right: 0,
                    transform: "translateY(-50%)",
                    width: 44,
                    height: 44,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    background: "transparent",
                    border: "none",
                    color: "var(--color-text-faint)",
                    cursor: "pointer",
                    borderRadius: "var(--r-1)",
                    transition: "color var(--motion-fast) var(--ease-out-quart)",
                  }}
                >
                  {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>
          )}

          {mode === "signup" && (
            <div>
              <label htmlFor="confirm-password" style={labelStyle}>
                Confirm password
              </label>
              <input
                id="confirm-password"
                type={showPassword ? "text" : "password"}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                placeholder="••••••••"
                aria-invalid={state === "error" && confirmInvalid}
                aria-describedby={state === "error" ? "login-error" : undefined}
                className="focus:outline-none input-focus-ring"
                style={inputStyle}
              />
            </div>
          )}

          {state === "pending" ? (
            <p
              role="status"
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-text-muted)",
                textAlign: "center",
                margin: 0,
              }}
            >
              {mode === "forgot"
                ? `Check your inbox — we sent a reset link to ${email}.`
                : `Check your inbox — we sent a confirmation link to ${email}.`}
            </p>
          ) : state === "error" ? (
            <p
              id="login-error"
              role="alert"
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-danger)",
                margin: 0,
              }}
            >
              {errorMsg || "Something went wrong."}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitDisabled}
            aria-disabled={submitDisabled}
            title={submitDisabled ? disabledHint : undefined}
            className="cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
            style={{
              width: "100%",
              minHeight: 44,
              background: "var(--accent)",
              color: "var(--color-text-on-cta)",
              border: "1px solid var(--accent)",
              borderRadius: "var(--r-1)",
              fontSize: "var(--t-meta)",
              fontWeight: 500,
              letterSpacing: "0.02em",
              marginTop: "var(--space-2)",
              transition: "opacity var(--motion-fast) var(--ease-out-quart)",
            }}
          >
            {submitLabel}
          </button>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
              alignItems: "center",
              fontSize: "var(--t-micro)",
              color: "var(--color-text-muted)",
            }}
          >
            {mode === "signin" && (
              <>
                <span>
                  New here?{" "}
                  <ModeLink onClick={() => switchMode("signup")}>Create an account</ModeLink>
                </span>
                <ModeLink onClick={() => switchMode("forgot")}>Forgot password?</ModeLink>
              </>
            )}
            {mode === "signup" && (
              <span>
                Already have an account?{" "}
                <ModeLink onClick={() => switchMode("signin")}>Sign in</ModeLink>
              </span>
            )}
            {mode === "forgot" && (
              <ModeLink onClick={() => switchMode("signin")}>Back to sign in</ModeLink>
            )}
          </div>
        </form>

        {mode === "signin" && DEMO_EMAIL && DEMO_PASSWORD && (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-3)",
            }}
          >
            <div
              aria-hidden="true"
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                height: 1,
              }}
            >
              <div
                style={{
                  position: "absolute",
                  inset: 0,
                  top: "50%",
                  borderTop: "1px solid var(--rule-soft)",
                }}
              />
              <span
                style={{
                  position: "relative",
                  padding: "0 var(--space-3)",
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text-faint)",
                  letterSpacing: "0.08em",
                  textTransform: "uppercase",
                  background: "var(--color-bg)",
                }}
              >
                or
              </span>
            </div>
            <button
              onClick={handleDemoLogin}
              disabled={state === "loading"}
              className="cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed hover-border-strong"
              style={{
                width: "100%",
                minHeight: 44,
                background: "transparent",
                color: "var(--color-text)",
                border: "1px solid var(--rule)",
                borderRadius: "var(--r-1)",
                fontSize: "var(--t-meta)",
                fontWeight: 500,
                letterSpacing: "0.02em",
                transition:
                  "border-color var(--motion-fast) var(--ease-out-quart), opacity var(--motion-fast) var(--ease-out-quart)",
              }}
            >
              Try the demo
            </button>
            <p
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-text-faint)",
                textAlign: "center",
                margin: 0,
              }}
            >
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
