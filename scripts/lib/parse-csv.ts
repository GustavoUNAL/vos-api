/** Parser CSV mínimo (campos entre comillas, comas). */
export function parseCsv(content: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let i = 0;
  let inQuotes = false;
  while (i < content.length) {
    const c = content[i];
    if (inQuotes) {
      if (c === '"') {
        if (content[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === ',') {
      row.push(field);
      field = '';
      i++;
      continue;
    }
    if (c === '\n' || c === '\r') {
      if (c === '\r' && content[i + 1] === '\n') i++;
      row.push(field);
      field = '';
      if (row.some((cell) => cell.length > 0)) rows.push(row);
      row = [];
      i++;
      continue;
    }
    field += c;
    i++;
  }
  row.push(field);
  if (row.some((cell) => cell.length > 0)) rows.push(row);
  return rows;
}

export function csvRowsToObjects<T extends Record<string, string>>(
  grid: string[][],
): T[] {
  if (grid.length < 2) return [];
  const headers = grid[0].map((h) => h.trim());
  const out: T[] = [];
  for (let r = 1; r < grid.length; r++) {
    const cells = grid[r];
    if (!cells.some((c) => c.trim())) continue;
    const obj = {} as T;
    for (let c = 0; c < headers.length; c++) {
      obj[headers[c] as keyof T] = (cells[c] ?? '').trim() as T[keyof T];
    }
    out.push(obj);
  }
  return out;
}
