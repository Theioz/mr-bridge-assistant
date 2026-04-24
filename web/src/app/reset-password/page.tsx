"use client";

import { createClient } from "@/lib/supabase/client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import Logo from "@/components/ui/logo";

type State = "idle" | "loading" | "error";

export default function ResetPasswordPage() {
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [state, setState] = useState<State>("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const router = useRouter();

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

  const pwInvalid = !password.trim();
  const confirmInvalid = confirmPassword !== password;
  const submitDisabled = state === "loading" || pwInvalid || confirmInvalid;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (password !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      setState("error");
      return;
    }
    setState("loading");
    setErrorMsg("");
    const supabase = createClient();
    const { error } = await supabase.auth.updateUser({ password });
    if (error) {
      setErrorMsg(error.message);
      setState("error");
    } else {
      router.push("/dashboard");
    }
  }

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
            Set new password
          </p>
        </header>

        <form
          onSubmit={handleSubmit}
          style={{ display: "flex", flexDirection: "column", gap: "var(--space-4)" }}
        >
          <div>
            <label htmlFor="password" style={labelStyle}>
              New password
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
                aria-describedby={state === "error" ? "reset-error" : undefined}
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
              aria-describedby={state === "error" ? "reset-error" : undefined}
              className="focus:outline-none input-focus-ring"
              style={inputStyle}
            />
          </div>

          {state === "error" && (
            <p
              id="reset-error"
              role="alert"
              style={{
                fontSize: "var(--t-micro)",
                color: "var(--color-danger)",
                margin: 0,
              }}
            >
              {errorMsg || "Something went wrong."}
            </p>
          )}

          <button
            type="submit"
            disabled={submitDisabled}
            aria-disabled={submitDisabled}
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
            {state === "loading" ? "Updating…" : "Update password"}
          </button>
        </form>
      </div>
    </div>
  );
}
