// RFC 4180 CSV reader. The counterpart to lib/export/csv.ts, which writes the same
// dialect: quoted fields may hold commas, CRLF, and doubled quotes.

/** Split CSV text into rows of raw cells. Blank trailing lines are dropped. */
export function parseCsvRows(text: string): string[][] {
  // Strip a UTF-8 BOM — Excel adds one and it would otherwise poison the first header.
  const src = text.charCodeAt(0) === 0xfeff ? text.slice(1) : text;

  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  let cellStarted = false;

  const endCell = () => {
    row.push(cell);
    cell = "";
    cellStarted = false;
  };
  const endRow = () => {
    endCell();
    // A row of one empty cell is a blank line, not a record.
    if (!(row.length === 1 && row[0] === "")) rows.push(row);
    row = [];
  };

  for (let i = 0; i < src.length; i++) {
    const ch = src[i];

    if (quoted) {
      if (ch === '"') {
        if (src[i + 1] === '"') {
          cell += '"';
          i++;
        } else {
          quoted = false;
        }
      } else {
        cell += ch;
      }
      continue;
    }

    if (ch === '"' && !cellStarted) {
      quoted = true;
      cellStarted = true;
    } else if (ch === ",") {
      endCell();
    } else if (ch === "\r") {
      // Consume CRLF as a single terminator; a lone CR also ends the row.
      if (src[i + 1] === "\n") i++;
      endRow();
    } else if (ch === "\n") {
      endRow();
    } else {
      cell += ch;
      cellStarted = true;
    }
  }

  // Flush whatever is left when the file does not end in a newline.
  if (cell !== "" || row.length > 0) endRow();

  return rows;
}

export interface ParsedCsv {
  headers: string[];
  /** One record per data row, keyed by header. Short rows yield "" for missing columns. */
  rows: Record<string, string>[];
}

export function parseCsv(text: string): ParsedCsv {
  const raw = parseCsvRows(text);
  if (raw.length === 0) return { headers: [], rows: [] };

  const headers = raw[0].map((h) => h.trim());
  const rows = raw.slice(1).map((cells) => {
    const rec: Record<string, string> = {};
    headers.forEach((h, i) => {
      rec[h] = (cells[i] ?? "").trim();
    });
    return rec;
  });

  return { headers, rows };
}
