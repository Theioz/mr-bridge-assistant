"use client";

import { useTransition } from "react";

interface GoogleIntegration {
  connectedAt: string;
  scopes: string[];
}

interface IntegrationsSettingsProps {
  googleIntegration: GoogleIntegration | null;
  disconnectAction: () => Promise<void>;
  errorParam?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  google_denied: "Google sign-in was cancelled.",
  google_csrf: "Security check failed. Please try again.",
  google_exchange: "Could not exchange the authorisation code. Please try again.",
  google_no_refresh_token:
    "Google did not issue a refresh token. Revoke Mr. Bridge access at myaccount.google.com/permissions, then connect again.",
  google_store: "Connected to Google but failed to save the token. Please try again.",
  google_invalid: "Invalid OAuth response. Please try again.",
};

function formatConnectedDate(iso: string): string {
  try {
    return new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

function scopeSummary(scopes: string[]): string {
  const labels: string[] = [];
  if (scopes.some((s) => s.includes("calendar"))) labels.push("Calendar");
  if (scopes.some((s) => s.includes("gmail"))) labels.push("Gmail");
  if (scopes.some((s) => s.includes("fitness"))) labels.push("Fitness");
  return labels.length ? labels.join(", ") : "Google";
}

export function IntegrationsSettings({
  googleIntegration,
  disconnectAction,
  errorParam,
}: IntegrationsSettingsProps) {
  const [isPending, startTransition] = useTransition();
  const errorMsg = errorParam ? ERROR_MESSAGES[errorParam] : null;

  return (
    <section
      aria-labelledby="integrations-heading"
      style={{
        paddingTop: "var(--space-6)",
        paddingBottom: "var(--space-6)",
        borderBottom: "1px solid var(--rule-soft)",
      }}
    >
      <h2 id="integrations-heading" className="db-section-label">
        Integrations
      </h2>

      {errorMsg && (
        <p
          role="alert"
          style={{
            fontSize: "var(--t-micro)",
            color: "var(--color-danger)",
            marginBottom: "var(--space-4)",
          }}
        >
          {errorMsg}
        </p>
      )}

      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "var(--space-4) 0",
          gap: "var(--space-4)",
        }}
      >
        <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-1)" }}>
          <span
            style={{
              fontSize: "var(--t-body)",
              fontWeight: 500,
              color: "var(--color-text)",
            }}
          >
            Google
          </span>
          <span
            style={{
              fontSize: "var(--t-micro)",
              color: "var(--color-text-muted)",
            }}
          >
            {googleIntegration
              ? `Connected ${formatConnectedDate(googleIntegration.connectedAt)} · ${scopeSummary(googleIntegration.scopes)}`
              : "Calendar, Gmail, and Fitness"}
          </span>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: "var(--space-3)" }}>
          {googleIntegration ? (
            <>
              <span
                style={{
                  fontSize: "var(--t-micro)",
                  fontWeight: 500,
                  color: "var(--color-positive)",
                  padding: "2px var(--space-2)",
                  border: "1px solid currentColor",
                  borderRadius: "var(--r-full, 9999px)",
                  opacity: 0.85,
                }}
              >
                Connected
              </span>
              <button
                type="button"
                disabled={isPending}
                onClick={() => startTransition(() => disconnectAction())}
                style={{
                  fontFamily: "var(--font-body), system-ui, sans-serif",
                  fontSize: "var(--t-micro)",
                  fontWeight: 500,
                  color: "var(--color-text-muted)",
                  background: "transparent",
                  border: "1px solid var(--rule)",
                  borderRadius: "var(--r-1)",
                  padding: "0 var(--space-3)",
                  minHeight: 36,
                  cursor: isPending ? "wait" : "pointer",
                  opacity: isPending ? 0.5 : 1,
                  transition: "opacity var(--motion-fast) var(--ease-out-quart)",
                }}
              >
                {isPending ? "Disconnecting…" : "Disconnect"}
              </button>
            </>
          ) : (
            <a
              href="/api/auth/google/start"
              style={{
                fontFamily: "var(--font-body), system-ui, sans-serif",
                fontSize: "var(--t-micro)",
                fontWeight: 500,
                color: "var(--color-text-on-cta)",
                background: "var(--accent)",
                border: "none",
                borderRadius: "var(--r-1)",
                padding: "0 var(--space-4)",
                minHeight: 36,
                display: "inline-flex",
                alignItems: "center",
                textDecoration: "none",
                transition: "opacity var(--motion-fast) var(--ease-out-quart)",
              }}
            >
              Connect Google
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
