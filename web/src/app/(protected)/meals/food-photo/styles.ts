export const inputStyle = {
  background: "transparent",
  border: "1px solid var(--rule)",
  color: "var(--color-text)",
  outline: "none",
  fontSize: 16,
  borderRadius: "var(--r-2)",
  padding: "var(--space-2) var(--space-3)",
  width: "100%",
  WebkitAppearance: "none" as const,
} as const;

export const textareaStyle = {
  ...inputStyle,
  resize: "none",
  lineHeight: 1.6,
  fontSize: "var(--t-meta)",
} as const;

export const fieldLabelStyle = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
  display: "block",
  marginBottom: "var(--space-1)",
} as const;

export const ctaStyle = {
  background: "var(--accent)",
  color: "var(--color-text-on-cta)",
  border: "none",
  borderRadius: "var(--r-2)",
  fontSize: "var(--t-meta)",
  fontWeight: 500,
  padding: "var(--space-2) var(--space-4)",
  cursor: "pointer",
} as const;

export const ghostStyle = {
  background: "transparent",
  color: "var(--color-text-muted)",
  border: "1px solid var(--rule)",
  borderRadius: "var(--r-2)",
  fontSize: "var(--t-meta)",
  padding: "var(--space-2) var(--space-4)",
  cursor: "pointer",
} as const;

export const pillBtnBase = {
  borderRadius: 20,
  fontSize: "var(--t-micro)",
  fontWeight: 500,
  padding: "var(--space-1) var(--space-3)",
  cursor: "pointer",
  border: "1px solid var(--rule)",
  transition: "all var(--motion-fast) var(--ease-out-quart)",
} as const;

export const iconButtonStyle = {
  background: "none",
  border: "none",
  cursor: "pointer",
  color: "var(--color-text-muted)",
  width: 32,
  height: 32,
} as const;

// Large primary/secondary buttons (Take Photo, Analyze, Log).
export const bigButtonSize = {
  fontSize: "var(--t-body)",
  padding: "var(--space-3) var(--space-5)",
  minHeight: 48,
} as const;

export const sheetStyle = {
  gap: "var(--space-3)",
  paddingTop: "var(--space-3)",
  borderTop: "1px solid var(--rule-soft)",
} as const;

export const sheetTitleStyle = {
  fontSize: "var(--t-meta)",
  fontWeight: 600,
  color: "var(--color-text)",
} as const;
