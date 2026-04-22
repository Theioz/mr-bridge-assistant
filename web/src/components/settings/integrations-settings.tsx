"use client";

import { useState, useTransition } from "react";
import { formatRelative } from "@/lib/relative-time";
import type { SyncStatus } from "@/lib/sync/log";

interface Integration {
  connectedAt: string;
  scopes: string[];
}

interface IntegrationsSettingsProps {
  googleIntegration: Integration | null;
  disconnectAction: () => Promise<void>;
  googleLastSync: SyncStatus | null;
  ouraIntegration: Integration | null;
  saveOuraTokenAction: (pat: string) => Promise<void>;
  disconnectOuraAction: () => Promise<void>;
  ouraLastSync: SyncStatus | null;
  fitbitIntegration: Integration | null;
  disconnectFitbitAction: () => Promise<void>;
  fitbitLastSync: SyncStatus | null;
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
  fitbit_denied: "Fitbit authorisation was cancelled.",
  fitbit_csrf: "Security check failed. Please try again.",
  fitbit_exchange: "Could not exchange the Fitbit authorisation code. Please try again.",
  fitbit_no_refresh_token: "Fitbit did not issue a refresh token. Please try connecting again.",
  fitbit_store: "Connected to Fitbit but failed to save the token. Please try again.",
  fitbit_invalid: "Invalid Fitbit OAuth response. Please try again.",
  oura_store: "Failed to save your Oura token. Please try again.",
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

function syncLabel(sync: SyncStatus | null): React.ReactElement {
  if (!sync) {
    return <span style={{ color: "var(--color-text-muted)" }}>Never synced</span>;
  }
  const rel = formatRelative(sync.syncedAt);
  if (sync.status === "ok") {
    return <span>Synced {rel}</span>;
  }
  return <span style={{ color: "var(--color-danger)" }}>Failed {rel}</span>;
}

interface SyncNowButtonProps {
  endpoint: "/api/sync/oura" | "/api/sync/fitbit";
  onDone: (s: SyncStatus) => void;
}

function SyncNowButton({ endpoint, onDone }: SyncNowButtonProps) {
  const [pending, setPending] = useState(false);

  async function handleSync() {
    setPending(true);
    try {
      const res = await fetch(endpoint, { method: "POST" });
      onDone({ syncedAt: new Date().toISOString(), status: res.ok ? "ok" : "error" });
    } catch {
      onDone({ syncedAt: new Date().toISOString(), status: "error" });
    } finally {
      setPending(false);
    }
  }

  return (
    <button
      type="button"
      disabled={pending}
      onClick={handleSync}
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
        cursor: pending ? "wait" : "pointer",
        opacity: pending ? 0.5 : 1,
        transition: "opacity var(--motion-fast) var(--ease-out-quart)",
      }}
    >
      {pending ? "Syncing…" : "Sync Now"}
    </button>
  );
}

const rowStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  padding: "var(--space-4) 0",
  gap: "var(--space-4)",
  borderBottom: "1px solid var(--rule-soft)",
};

const labelColStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: "var(--space-1)",
};

const nameStyle: React.CSSProperties = {
  fontSize: "var(--t-body)",
  fontWeight: 500,
  color: "var(--color-text)",
};

const descStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
};

const actionColStyle: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-3)",
  flexShrink: 0,
};

const connectedBadgeStyle: React.CSSProperties = {
  fontSize: "var(--t-micro)",
  fontWeight: 500,
  color: "var(--color-positive)",
  padding: "2px var(--space-2)",
  border: "1px solid currentColor",
  borderRadius: "var(--r-full, 9999px)",
  opacity: 0.85,
};

function disconnectButtonStyle(pending: boolean): React.CSSProperties {
  return {
    fontFamily: "var(--font-body), system-ui, sans-serif",
    fontSize: "var(--t-micro)",
    fontWeight: 500,
    color: "var(--color-text-muted)",
    background: "transparent",
    border: "1px solid var(--rule)",
    borderRadius: "var(--r-1)",
    padding: "0 var(--space-3)",
    minHeight: 36,
    cursor: pending ? "wait" : "pointer",
    opacity: pending ? 0.5 : 1,
    transition: "opacity var(--motion-fast) var(--ease-out-quart)",
  };
}

function connectLinkStyle(): React.CSSProperties {
  return {
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
  };
}

export function IntegrationsSettings({
  googleIntegration,
  disconnectAction,
  googleLastSync,
  ouraIntegration,
  saveOuraTokenAction,
  disconnectOuraAction,
  ouraLastSync,
  fitbitIntegration,
  disconnectFitbitAction,
  fitbitLastSync,
  errorParam,
}: IntegrationsSettingsProps) {
  const [googlePending, startGoogleTransition] = useTransition();
  const [ouraPending, startOuraTransition] = useTransition();
  const [fitbitPending, startFitbitTransition] = useTransition();
  const [ouraExpanded, setOuraExpanded] = useState(false);
  const [ouraToken, setOuraToken] = useState("");
  const [ouraSaving, setOuraSaving] = useState(false);
  const [ouraSync, setOuraSync] = useState<SyncStatus | null>(ouraLastSync ?? null);
  const [fitbitSync, setFitbitSync] = useState<SyncStatus | null>(fitbitLastSync ?? null);

  const errorMsg = errorParam ? ERROR_MESSAGES[errorParam] : null;

  function handleSaveOura() {
    if (!ouraToken.trim()) return;
    setOuraSaving(true);
    startOuraTransition(async () => {
      try {
        await saveOuraTokenAction(ouraToken.trim());
        setOuraExpanded(false);
        setOuraToken("");
      } finally {
        setOuraSaving(false);
      }
    });
  }

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

      {/* ── Google ── */}
      <div style={rowStyle}>
        <div style={labelColStyle}>
          <span style={nameStyle}>Google</span>
          {googleIntegration ? (
            <>
              <span style={descStyle}>
                {`Connected ${formatConnectedDate(googleIntegration.connectedAt)} · ${scopeSummary(googleIntegration.scopes)}`}
              </span>
              <span style={{ ...descStyle, marginTop: "var(--space-1)" }}>
                {syncLabel(googleLastSync)}
              </span>
            </>
          ) : (
            <span style={descStyle}>Calendar, Gmail, and Fitness</span>
          )}
        </div>

        <div style={actionColStyle}>
          {googleIntegration ? (
            <>
              <span style={connectedBadgeStyle}>Connected</span>
              <button
                type="button"
                disabled={googlePending}
                onClick={() => startGoogleTransition(() => disconnectAction())}
                style={disconnectButtonStyle(googlePending)}
              >
                {googlePending ? "Disconnecting…" : "Disconnect"}
              </button>
            </>
          ) : (
            <a href="/api/auth/google/start" style={connectLinkStyle()}>
              Connect Google
            </a>
          )}
        </div>
      </div>

      {/* ── Oura ── */}
      <div style={{ borderBottom: "1px solid var(--rule-soft)" }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            padding: "var(--space-4) 0",
            gap: "var(--space-4)",
          }}
        >
          <div style={labelColStyle}>
            <span style={nameStyle}>Oura</span>
            {ouraIntegration ? (
              <>
                <span style={descStyle}>
                  {`Connected ${formatConnectedDate(ouraIntegration.connectedAt)} · Sleep, readiness, HRV`}
                </span>
                <span style={{ ...descStyle, marginTop: "var(--space-1)" }}>
                  {syncLabel(ouraSync)}
                </span>
              </>
            ) : (
              <span style={descStyle}>Ring data — sleep, readiness, HRV</span>
            )}
          </div>

          <div style={actionColStyle}>
            {ouraIntegration ? (
              <>
                <span style={connectedBadgeStyle}>Connected</span>
                <SyncNowButton endpoint="/api/sync/oura" onDone={setOuraSync} />
                <button
                  type="button"
                  disabled={ouraPending}
                  onClick={() => startOuraTransition(() => disconnectOuraAction())}
                  style={disconnectButtonStyle(ouraPending)}
                >
                  {ouraPending ? "Disconnecting…" : "Disconnect"}
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setOuraExpanded((v) => !v)}
                style={connectLinkStyle()}
              >
                {ouraExpanded ? "Cancel" : "Connect Oura"}
              </button>
            )}
          </div>
        </div>

        {ouraExpanded && !ouraIntegration && (
          <div
            style={{
              paddingBottom: "var(--space-4)",
              display: "flex",
              flexDirection: "column",
              gap: "var(--space-2)",
            }}
          >
            <p style={{ fontSize: "var(--t-micro)", color: "var(--color-text-muted)" }}>
              Paste a Personal Access Token from{" "}
              <a
                href="https://cloud.ouraring.com/personal-access-tokens"
                target="_blank"
                rel="noopener noreferrer"
                style={{ color: "var(--accent)", textDecoration: "none" }}
              >
                cloud.ouraring.com/personal-access-tokens
              </a>
            </p>
            <div style={{ display: "flex", gap: "var(--space-2)", alignItems: "center" }}>
              <input
                type="password"
                value={ouraToken}
                onChange={(e) => setOuraToken(e.target.value)}
                placeholder="Oura Personal Access Token"
                style={{
                  fontFamily: "var(--font-body), system-ui, sans-serif",
                  fontSize: "var(--t-micro)",
                  color: "var(--color-text)",
                  background: "var(--surface-raised, var(--surface))",
                  border: "1px solid var(--rule)",
                  borderRadius: "var(--r-1)",
                  padding: "0 var(--space-3)",
                  minHeight: 36,
                  flex: 1,
                  outline: "none",
                }}
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveOura();
                  if (e.key === "Escape") {
                    setOuraExpanded(false);
                    setOuraToken("");
                  }
                }}
              />
              <button
                type="button"
                disabled={ouraSaving || !ouraToken.trim()}
                onClick={handleSaveOura}
                style={{
                  ...connectLinkStyle(),
                  opacity: ouraSaving || !ouraToken.trim() ? 0.5 : 1,
                  cursor: ouraSaving || !ouraToken.trim() ? "not-allowed" : "pointer",
                }}
              >
                {ouraSaving ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ── Fitbit ── */}
      <div style={{ paddingTop: "var(--space-4)", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "var(--space-4)" }}>
        <div style={labelColStyle}>
          <span style={nameStyle}>Fitbit</span>
          {fitbitIntegration ? (
            <>
              <span style={descStyle}>
                {`Connected ${formatConnectedDate(fitbitIntegration.connectedAt)} · Activities, weight, heart rate`}
              </span>
              <span style={{ ...descStyle, marginTop: "var(--space-1)" }}>
                {syncLabel(fitbitSync)}
              </span>
            </>
          ) : (
            <span style={descStyle}>Activities, weight, heart rate</span>
          )}
        </div>

        <div style={actionColStyle}>
          {fitbitIntegration ? (
            <>
              <span style={connectedBadgeStyle}>Connected</span>
              <SyncNowButton endpoint="/api/sync/fitbit" onDone={setFitbitSync} />
              <button
                type="button"
                disabled={fitbitPending}
                onClick={() => startFitbitTransition(() => disconnectFitbitAction())}
                style={disconnectButtonStyle(fitbitPending)}
              >
                {fitbitPending ? "Disconnecting…" : "Disconnect"}
              </button>
            </>
          ) : (
            <a href="/api/auth/fitbit/start" style={connectLinkStyle()}>
              Connect Fitbit
            </a>
          )}
        </div>
      </div>
    </section>
  );
}
