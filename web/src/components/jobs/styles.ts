// Shared inline styles for the /jobs page (server) and its client components. Same tokens and
// touch sizes as the inventory catalog: 44px targets, 16px inputs (iOS zooms below 16px, #688).
import type { CSSProperties } from "react";

export const mutedStyle: CSSProperties = {
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
};
export const h2Style: CSSProperties = {
  fontSize: "var(--t-h2)",
  color: "var(--color-text)",
  fontWeight: 600,
  marginBottom: "var(--space-2)",
};
export const listStyle: CSSProperties = { listStyle: "none", padding: 0, margin: 0 };
export const rowStyle: CSSProperties = {
  borderBottom: "1px solid var(--rule-soft)",
  padding: "var(--space-3) 0",
  minWidth: 0,
  overflowWrap: "anywhere",
};
export const linksStyle: CSSProperties = {
  display: "flex",
  flexWrap: "wrap",
  gap: "var(--space-3)",
  marginTop: "var(--space-1)",
  fontSize: "var(--t-micro)",
};
export const tagStyle: CSSProperties = {
  border: "1px solid var(--rule-soft)",
  borderRadius: "var(--r-1)",
  padding: "0 var(--space-1)",
  marginRight: "var(--space-1)",
  color: "var(--color-text)",
};
export const labelStyle: CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 4,
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
};
export const checkStyle: CSSProperties = {
  display: "flex",
  alignItems: "center",
  gap: "var(--space-2)",
  minHeight: 44,
  fontSize: "var(--t-micro)",
  color: "var(--color-text-muted)",
};
export const inputStyle: CSSProperties = {
  fontFamily: "var(--font-body), system-ui, sans-serif",
  fontSize: 16,
  color: "var(--color-text)",
  background: "var(--color-surface)",
  border: "1px solid var(--rule-soft)",
  borderRadius: "var(--r-1)",
  padding: "0 var(--space-2)",
  minHeight: 44,
  minWidth: 0,
};
export const btnStyle: CSSProperties = {
  minHeight: 44,
  padding: "0 var(--space-3)",
  borderRadius: "var(--r-1)",
  border: "1px solid var(--rule-soft)",
  background: "transparent",
  color: "var(--color-text)",
  fontSize: "var(--t-micro)",
  cursor: "pointer",
};
export const gridStyle: CSSProperties = {
  display: "grid",
  gridTemplateColumns: "repeat(auto-fill, minmax(11rem, 1fr))",
  gap: "var(--space-2)",
  alignItems: "end",
  margin: "var(--space-3) 0",
};
export const panelStyle: CSSProperties = {
  border: "1px solid var(--rule-soft)",
  borderRadius: "var(--r-2)",
  padding: "var(--space-3)",
  background: "var(--color-surface)",
};
