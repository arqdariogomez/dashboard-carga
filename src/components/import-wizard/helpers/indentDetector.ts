/**
 * Detect group/category rows in Excel data
 * Users often have rows that act as group headers (e.g., "SUCURSAL CHIHUAHUA")
 */

export interface GroupRow {
  rowIndex: number;
  label: string;
  method: 'indent' | 'sparse' | 'formatting';
}

/**
 * Detect rows that appear to be group headers rather than data rows.
 * Method 1: Rows where only the first 1-2 columns have values (sparse rows)
 * Method 2: Rows with leading spaces (indent)
 */
export function detectGroupRows(
  rows: Record<string, unknown>[],
  headers: string[]
): GroupRow[] {
  const groups: GroupRow[] = [];
  const totalColumns = headers.length;

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    
    // Count non-empty cells
    let nonEmptyCells = 0;
    let firstCellValue = '';
    
    for (let j = 0; j < headers.length; j++) {
      const val = row[headers[j]];
      if (val != null && val !== '' && val !== 0) {
        nonEmptyCells++;
        if (j === 0) firstCellValue = String(val).trim();
      }
    }

    // Method 1: Sparse row - only first cell has a value and there are 4+ columns total
    if (nonEmptyCells === 1 && totalColumns >= 4 && firstCellValue.length > 0) {
      groups.push({
        rowIndex: i,
        label: firstCellValue,
        method: 'sparse',
      });
      continue;
    }

    // Method 2: Check for leading spaces (indent)
    const firstHeader = headers[0];
    const firstVal = row[firstHeader];
    if (typeof firstVal === 'string') {
      const trimmed = firstVal.trimStart();
      const indent = firstVal.length - trimmed.length;
      if (indent === 0 && nonEmptyCells <= 2 && totalColumns >= 4 && trimmed.length > 0) {
        // Could be a category header with ALL CAPS
        if (trimmed === trimmed.toUpperCase() && trimmed.length > 3 && !/\d/.test(trimmed)) {
          groups.push({
            rowIndex: i,
            label: trimmed,
            method: 'formatting',
          });
        }
      }
    }
  }

  return groups;
}

/**
 * Filter out group rows from data
 */
export function removeGroupRows(
  rows: Record<string, unknown>[],
  groupRows: GroupRow[]
): Record<string, unknown>[] {
  const groupIndices = new Set(groupRows.map(g => g.rowIndex));
  return rows.filter((_, idx) => !groupIndices.has(idx));
}
