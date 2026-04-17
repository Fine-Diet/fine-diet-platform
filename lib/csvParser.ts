/**
 * RFC 4180-compliant CSV parser
 *
 * Handles:
 *   - Quoted fields with commas: "Smith, Jr."
 *   - Escaped quotes inside quoted fields: "He said ""hello"""
 *   - CRLF, LF, and CR line endings
 *   - Empty rows (skipped)
 *   - BOM (UTF-8 byte-order mark, common in Excel exports)
 */

/** Split CSV text into lines, respecting quoted newlines */
function splitLines(text: string): string[] {
  // Strip UTF-8 BOM if present
  const clean = text.startsWith('\uFEFF') ? text.slice(1) : text;
  const normalized = clean.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  const lines: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized[i];
    if (ch === '"') {
      // Escaped quote inside quoted field
      if (inQuotes && normalized[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
        current += ch;
      }
    } else if (ch === '\n' && !inQuotes) {
      if (current.trim()) lines.push(current);
      current = '';
    } else {
      current += ch;
    }
  }
  if (current.trim()) lines.push(current);
  return lines;
}

/** Parse a single CSV line into an array of field values */
function parseLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      fields.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  fields.push(current.trim());
  return fields;
}

export interface ParsedCSV {
  /** Lowercased, trimmed header names */
  headers: string[];
  /** One record per data row, keyed by lowercased header */
  rows: Record<string, string>[];
  totalLines: number;
}

export function parseCSV(text: string): ParsedCSV {
  const lines = splitLines(text);
  if (lines.length === 0) return { headers: [], rows: [], totalLines: 0 };

  const headers = parseLine(lines[0]).map((h) => h.toLowerCase().replace(/^["']|["']$/g, '').trim());

  const rows: Record<string, string>[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseLine(lines[i]);
    // Skip entirely blank rows
    if (values.every((v) => !v)) continue;
    const row: Record<string, string> = {};
    headers.forEach((h, idx) => {
      row[h] = (values[idx] ?? '').replace(/^["']|["']$/g, '').trim();
    });
    rows.push(row);
  }

  return { headers, rows, totalLines: lines.length - 1 };
}
