// Deterministic CSV serializer. Column order comes from the caller so nulls in the
// first row don't drift columns between exports.

function serializeCell(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function escapeCell(cell: string): string {
  if (/[",\r\n]/.test(cell)) {
    return `"${cell.replace(/"/g, '""')}"`;
  }
  return cell;
}

export function toCSV(rows: Record<string, unknown>[], columns: string[]): string {
  const lines: string[] = [];
  lines.push(columns.map(escapeCell).join(","));
  for (const row of rows) {
    const cells = columns.map((col) => escapeCell(serializeCell(row[col])));
    lines.push(cells.join(","));
  }
  return lines.join("\r\n") + "\r\n";
}
