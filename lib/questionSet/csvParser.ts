/**
 * CSV Parser Utility
 * 
 * Parses CSV files with row/column tracking for error reporting
 */

export interface CSVParseError {
  file: string;
  row: number;
  column?: string;
  message: string;
}

export interface ParsedCSVRow {
  [key: string]: string;
  __rowNumber: number; // Track original row number for error reporting
}

/**
 * Parse CSV content into rows with header validation
 */
export function parseCSV(
  content: string,
  filename: string,
  expectedHeaders: string[]
): { rows: ParsedCSVRow[]; errors: CSVParseError[] } {
  const errors: CSVParseError[] = [];
  const rows: ParsedCSVRow[] = [];

  // Split into lines
  const lines = content.split(/\r?\n/).filter((line) => line.trim().length > 0);

  if (lines.length === 0) {
    errors.push({
      file: filename,
      row: 0,
      message: 'CSV file is empty',
    });
    return { rows, errors };
  }

  // Parse header row
  const headerLine = lines[0];
  const headers = parseCSVLine(headerLine);

  // Validate headers match expected
  if (headers.length !== expectedHeaders.length) {
    errors.push({
      file: filename,
      row: 1,
      message: `Expected ${expectedHeaders.length} columns, got ${headers.length}`,
    });
    return { rows, errors };
  }

  for (let i = 0; i < headers.length; i++) {
    if (headers[i] !== expectedHeaders[i]) {
      errors.push({
        file: filename,
        row: 1,
        column: expectedHeaders[i],
        message: `Header mismatch: expected "${expectedHeaders[i]}", got "${headers[i]}"`,
      });
      return { rows, errors };
    }
  }

  // Parse data rows (skip header)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    const values = parseCSVLine(line);

    if (values.length !== headers.length) {
      errors.push({
        file: filename,
        row: i + 1,
        message: `Row has ${values.length} columns, expected ${headers.length}`,
      });
      continue; // Skip this row
    }

    const row: ParsedCSVRow = { __rowNumber: i + 1 };
    for (let j = 0; j < headers.length; j++) {
      row[headers[j]] = values[j].trim();
    }
    rows.push(row);
  }

  return { rows, errors };
}

/**
 * Parse a single CSV line, handling quoted fields
 */
function parseCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        // Escaped quote
        current += '"';
        i++; // Skip next quote
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  // Add last field
  result.push(current);

  return result;
}

