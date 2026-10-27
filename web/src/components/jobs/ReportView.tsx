import type { CSSProperties, ReactNode } from "react";
import { parseMarkdown, type Inline } from "@/lib/jobs/jobs";

/**
 * Renders a Job Scout report (agent-written markdown) as React elements — never as HTML. The parser
 * in lib/jobs/jobs.ts only knows headings, paragraphs, lists, tables, bold and http(s) links.
 */
export function ReportView({ markdown }: { markdown: string }) {
  return (
    <div
      style={{ fontSize: "var(--t-body)", color: "var(--color-text)", overflowWrap: "anywhere" }}
    >
      {parseMarkdown(markdown).map((b, i) => {
        switch (b.type) {
          case "h1":
          case "h2":
            return (
              <h3 key={i} className="font-heading" style={headStyle}>
                {render(b.inl)}
              </h3>
            );
          case "h3":
            return (
              <h4 key={i} style={{ ...headStyle, fontSize: "var(--t-body)" }}>
                {render(b.inl)}
              </h4>
            );
          case "p":
            return (
              <p key={i} style={{ margin: "var(--space-2) 0" }}>
                {render(b.inl)}
              </p>
            );
          case "ul":
            return (
              <ul key={i} style={{ margin: "var(--space-2) 0", paddingLeft: "var(--space-5)" }}>
                {b.items.map((it, j) => (
                  <li key={j}>{render(it)}</li>
                ))}
              </ul>
            );
          case "table":
            return (
              <div key={i} style={{ overflowX: "auto", margin: "var(--space-2) 0" }}>
                <table style={{ borderCollapse: "collapse", fontSize: "var(--t-micro)" }}>
                  <thead>
                    <tr>
                      {b.head.map((c, j) => (
                        <th key={j} style={cellStyle}>
                          {render(c)}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.map((r, j) => (
                      <tr key={j}>
                        {r.map((c, k) => (
                          <td key={k} style={cellStyle}>
                            {render(c)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
        }
      })}
    </div>
  );
}

function render(inl: Inline[]): ReactNode {
  return inl.map((x, i) =>
    x.t === "b" ? (
      <strong key={i}>{x.s}</strong>
    ) : x.t === "a" ? (
      <a key={i} href={x.href} target="_blank" rel="noreferrer">
        {x.s}
      </a>
    ) : (
      <span key={i}>{x.s}</span>
    ),
  );
}

const headStyle: CSSProperties = {
  fontSize: "var(--t-h3, var(--t-body))",
  fontWeight: 600,
  margin: "var(--space-4) 0 var(--space-1)",
};
const cellStyle: CSSProperties = {
  border: "1px solid var(--rule-soft)",
  padding: "var(--space-1) var(--space-2)",
  textAlign: "left",
  verticalAlign: "top",
};
