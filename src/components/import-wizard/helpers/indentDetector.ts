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
/**
 * Detect indent level for each row based on leading spaces in first column
 * Returns map of rowIndex -> indentLevel
 * Each level represents one indent (typically an Excel indent unit)
 */
export function detectIndentLevels(
  rows: Record<string, unknown>[],
  firstColumnName: string
): Map<number, number> {
  const indentMap = new Map<number, number>();

  rows.forEach((row, idx) => {
    const firstVal = row[firstColumnName];
    if (typeof firstVal === 'string') {
      const trimmed = firstVal.trimStart();
      const indent = firstVal.length - trimmed.length;
      // Normalize indent: count leading spaces divided by typical indent spacing (usually 2-4 spaces)
      const indentLevel = Math.floor(indent / 2); // Can adjust divisor based on preference
      indentMap.set(idx, Math.max(0, indentLevel));
    } else {
      indentMap.set(idx, 0);
    }
  });

  return indentMap;
}

/**
 * Calculate parentId for rows based on indent levels
 * Algorithm: find the closest parent row that has an indent level one less than current
 * Returns map of rowIndex -> parentRowIndex (or -1 if root)
 */
export function calculateParentsByIndent(
  rows: Record<string, unknown>[],
  firstColumnName: string
): Map<number, number> {
  const indentLevels = detectIndentLevels(rows, firstColumnName);
  const parentMap = new Map<number, number>();

  for (let i = 0; i < rows.length; i++) {
    const currentLevel = indentLevels.get(i) ?? 0;

    if (currentLevel === 0) {
      // Root - no parent
      parentMap.set(i, -1);
    } else {
      // Find closest parent with level = currentLevel - 1
      let parentIdx = -1;
      for (let j = i - 1; j >= 0; j--) {
        const checkLevel = indentLevels.get(j) ?? 0;
        if (checkLevel === currentLevel - 1) {
          parentIdx = j;
          break;
        }
      }
      parentMap.set(i, parentIdx);
    }
  }

  return parentMap;
}

/**
 * Enrich row data with parentId metadata
 * Used when transforming raw rows to projects (before we have project IDs)
 * Stores parentRowIndex as temporary reference
 */
export interface RowWithParent extends Record<string, unknown> {
  _rowIndex: number;
  _indentLevel: number;
  _parentRowIndex: number; // -1 if root, else index of parent row
}

export function enrichRowsWithParent(
  rows: Record<string, unknown>[],
  firstColumnName: string
): RowWithParent[] {
  const indentLevels = detectIndentLevels(rows, firstColumnName);
  const parentMap = calculateParentsByIndent(rows, firstColumnName);

  return rows.map((row, idx) => ({
    ...row,
    _rowIndex: idx,
    _indentLevel: indentLevels.get(idx) ?? 0,
    _parentRowIndex: parentMap.get(idx) ?? -1,
  }));
}

/**
 * Build map from rowIndex to finalProjectId
 * This is used to resolve _parentRowIndex to actual parentId after projects are created
 */
export interface RowIndexMap {
  rowIndexToProjectId: Map<number, string>;
}

export function createRowIndexMap(
  projects: Array<{ id: string; _rowIndex?: number }>
): RowIndexMap {
  const rowIndexToProjectId = new Map<number, string>();

  projects.forEach(p => {
    if (typeof p._rowIndex === 'number') {
      rowIndexToProjectId.set(p._rowIndex, p.id);
    }
  });

  return { rowIndexToProjectId };
}

/**
 * Resolve temporary parent references to actual project IDs
 * Takes projects with _parentRowIndex and converts to parentId
 */
export function resolveParentIds<T extends { _parentRowIndex?: number; parentId?: string | null }>(
  items: T[],
  rowIndexMap: RowIndexMap
): T[] {
  return items.map(item => {
    if (typeof item._parentRowIndex === 'number' && item._parentRowIndex !== -1) {
      const parentId = rowIndexMap.rowIndexToProjectId.get(item._parentRowIndex);
      return { ...item, parentId: parentId || null };
    }
    return { ...item, parentId: null };
  });
}