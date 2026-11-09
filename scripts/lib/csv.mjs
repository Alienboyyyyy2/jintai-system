// Minimal RFC 4180 CSV reader/writer (no dependencies).
// Handles quoted fields, escaped quotes (""), CRLF/LF, a UTF-8 BOM and blank lines.

export function parseCSV(text) {
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1); // Excel adds a BOM
  const rows = [];
  let row = [], field = "", i = 0, quoted = false;
  while (i < text.length) {
    const c = text[i];
    if (quoted) {
      if (c === '"') {
        if (text[i + 1] === '"') { field += '"'; i += 2; continue; }
        quoted = false; i++; continue;
      }
      field += c; i++; continue;
    }
    if (c === '"' && field === "") { quoted = true; i++; continue; }
    if (c === ",") { row.push(field); field = ""; i++; continue; }
    if (c === "\r" || c === "\n") {
      row.push(field); field = "";
      if (c === "\r" && text[i + 1] === "\n") i++;
      i++;
      if (row.some(f => f.trim() !== "")) rows.push(row);
      row = [];
      continue;
    }
    field += c; i++;
  }
  if (quoted) throw new Error("CSV ends inside a quoted field");
  row.push(field);
  if (row.some(f => f.trim() !== "")) rows.push(row);
  return rows;
}

// Returns [{...record, _line}] keyed by the header row (headers trimmed and lower-cased).
export function readRecords(text) {
  const rows = parseCSV(text);
  if (!rows.length) return { headers: [], records: [] };
  const headers = rows[0].map(h => h.trim().toLowerCase());
  const records = rows.slice(1).map((r, idx) => {
    const rec = { _line: idx + 2 };
    headers.forEach((h, j) => { rec[h] = (r[j] ?? "").trim(); });
    return rec;
  });
  return { headers, records };
}

export function toCSV(headers, rows) {
  const q = v => {
    const s = v == null ? "" : String(v);
    return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers, ...rows].map(r => r.map(q).join(",")).join("\n") + "\n";
}
