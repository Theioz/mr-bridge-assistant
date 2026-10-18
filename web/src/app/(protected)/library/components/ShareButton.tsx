"use client";

import { useState, useRef } from "react";
import { Share2, X, Copy, Check, Link as LinkIcon } from "lucide-react";
import { libraryShareUrl } from "@/lib/share-url";

export default function ShareButton({
  initialShareToken,
  shareBase,
}: {
  initialShareToken: string | null;
  /** Public share origin, resolved on the server by `shareBaseUrl()` (#761). */
  shareBase: string;
}) {
  // ── Share state ──────────────────────────────────────────────────────────────
  // The link is for someone OUTSIDE the tailnet, so it is built on the public share host the
  // server resolved — never `window.location.origin`, which is whatever host the owner has open
  // (the tailnet name) and which made the server and client renders disagree (#761).
  const [shareToken, setShareToken] = useState<string | null>(initialShareToken);
  const [showSharePanel, setShowSharePanel] = useState(false);
  const [sharePanelPos, setSharePanelPos] = useState<{ top: number; right: number } | null>(null);
  const [shareLoading, setShareLoading] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  const shareBtnRef = useRef<HTMLButtonElement>(null);
  const shareUrl = shareToken ? libraryShareUrl(shareToken, shareBase) : null;

  const generateShareLink = async () => {
    setShareLoading(true);
    const res = await fetch("/api/library/share", { method: "POST" });
    if (res.ok) {
      const data = await res.json();
      setShareToken(data.share_token as string);
    }
    setShareLoading(false);
  };

  const revokeShareLink = async () => {
    setShareLoading(true);
    const res = await fetch("/api/library/share", { method: "DELETE" });
    if (res.ok) setShareToken(null);
    setShareLoading(false);
  };

  const copyShareUrl = async () => {
    if (!shareUrl) return;
    await navigator.clipboard.writeText(shareUrl);
    setShareCopied(true);
    setTimeout(() => setShareCopied(false), 2000);
  };

  return (
    <div>
      <button
        ref={shareBtnRef}
        onClick={() => {
          if (!showSharePanel) {
            const rect = shareBtnRef.current?.getBoundingClientRect();
            setSharePanelPos(
              rect
                ? { top: rect.bottom + 8, right: window.innerWidth - rect.right }
                : { top: 60, right: 16 },
            );
          }
          setShowSharePanel((p) => !p);
        }}
        title="Share library"
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: shareToken ? "var(--color-primary-dim)" : "transparent",
          color: shareToken ? "var(--color-primary)" : "var(--color-text-muted)",
          border: "1px solid var(--rule-soft)",
          borderRadius: 8,
          padding: "8px 12px",
          fontSize: 14,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        <Share2 size={15} />
      </button>

      {showSharePanel && sharePanelPos && (
        <div
          style={{
            position: "fixed",
            top: sharePanelPos.top,
            right: sharePanelPos.right,
            width: 340,
            background: "var(--color-bg-1)",
            border: "1px solid var(--rule-soft)",
            borderRadius: 10,
            padding: 16,
            boxShadow: "var(--shadow-lg)",
            zIndex: 9999,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              marginBottom: 12,
            }}
          >
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14 }}>Public Library Link</p>
            <button
              onClick={() => setShowSharePanel(false)}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--color-text-muted)",
                padding: 2,
              }}
            >
              <X size={14} />
            </button>
          </div>

          <p
            style={{
              margin: "0 0 12px",
              fontSize: 13,
              color: "var(--color-text-muted)",
              lineHeight: 1.5,
            }}
          >
            {shareToken
              ? "Anyone with this link can view your full library."
              : "Generate a public link to share your entire library — no account needed to view."}
          </p>

          {shareToken ? (
            <>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 6,
                  background: "var(--color-bg-2)",
                  border: "1px solid var(--rule-soft)",
                  borderRadius: 6,
                  padding: "7px 10px",
                  marginBottom: 10,
                }}
              >
                <LinkIcon size={12} style={{ color: "var(--color-text-muted)", flexShrink: 0 }} />
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--color-text-muted)",
                    flex: 1,
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                  }}
                >
                  {shareUrl}
                </span>
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={copyShareUrl}
                  style={{
                    flex: 1,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                    background: "var(--color-primary)",
                    color: "var(--color-text-on-cta)",
                    border: "none",
                    borderRadius: 6,
                    padding: "8px 12px",
                    fontSize: 13,
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {shareCopied ? (
                    <>
                      <Check size={13} /> Copied
                    </>
                  ) : (
                    <>
                      <Copy size={13} /> Copy link
                    </>
                  )}
                </button>
                <button
                  onClick={revokeShareLink}
                  disabled={shareLoading}
                  style={{
                    background: "none",
                    border: "1px solid var(--rule-soft)",
                    borderRadius: 6,
                    padding: "8px 12px",
                    fontSize: 13,
                    color: "var(--color-text-muted)",
                    cursor: shareLoading ? "not-allowed" : "pointer",
                    opacity: shareLoading ? 0.5 : 1,
                  }}
                >
                  Revoke
                </button>
              </div>
            </>
          ) : (
            <button
              onClick={generateShareLink}
              disabled={shareLoading}
              style={{
                width: "100%",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 6,
                background: "var(--color-primary)",
                color: "var(--color-text-on-cta)",
                border: "none",
                borderRadius: 6,
                padding: "9px 14px",
                fontSize: 13,
                fontWeight: 600,
                cursor: shareLoading ? "not-allowed" : "pointer",
                opacity: shareLoading ? 0.6 : 1,
              }}
            >
              {shareLoading ? (
                "Generating…"
              ) : (
                <>
                  <Share2 size={14} /> Generate link
                </>
              )}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
