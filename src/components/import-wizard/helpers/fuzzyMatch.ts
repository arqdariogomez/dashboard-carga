/**
 * Fuzzy matching utilities for column name detection
 */

export function normalizeString(str: string): string {
  return str
    .toLowerCase()
    .trim()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9\s]/g, '')
    .replace(/\s+/g, ' ');
}

/**
 * Levenshtein distance between two strings
 */
export function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = [];

  for (let i = 0; i <= b.length; i++) {
    matrix[i] = [i];
  }
  for (let j = 0; j <= a.length; j++) {
    matrix[0][j] = j;
  }

  for (let i = 1; i <= b.length; i++) {
    for (let j = 1; j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1,
          matrix[i][j - 1] + 1,
          matrix[i - 1][j] + 1
        );
      }
    }
  }

  return matrix[b.length][a.length];
}

/**
 * Check if string a contains string b or vice versa
 */
export function containsMatch(a: string, b: string): boolean {
  return a.includes(b) || b.includes(a);
}

export interface FuzzyMatchResult {
  match: boolean;
  confidence: number;
  method: 'exact' | 'contains' | 'levenshtein' | 'data-type' | 'none';
}

/**
 * Fuzzy match a header string against a target field alias
 */
export function fuzzyMatchHeader(header: string, alias: string): FuzzyMatchResult {
  const normHeader = normalizeString(header);
  const normAlias = normalizeString(alias);

  // Exact match
  if (normHeader === normAlias) {
    return { match: true, confidence: 1.0, method: 'exact' };
  }

  // Contains match
  if (containsMatch(normHeader, normAlias) && normAlias.length >= 3) {
    const ratio = Math.min(normHeader.length, normAlias.length) / Math.max(normHeader.length, normAlias.length);
    return { match: true, confidence: 0.7 + (ratio * 0.2), method: 'contains' };
  }

  // Levenshtein distance
  const distance = levenshteinDistance(normHeader, normAlias);
  const maxLen = Math.max(normHeader.length, normAlias.length);
  if (distance <= 2 && maxLen > 3) {
    const confidence = 1 - (distance / maxLen);
    return { match: true, confidence: Math.max(0.5, confidence * 0.8), method: 'levenshtein' };
  }

  return { match: false, confidence: 0, method: 'none' };
}

/**
 * Detect if column values look like dates
 */
export function looksLikeDates(values: unknown[]): boolean {
  const validValues = values.filter(v => v != null && v !== '');
  if (validValues.length === 0) return false;
  
  let dateCount = 0;
  for (const v of validValues.slice(0, 10)) {
    if (v instanceof Date) { dateCount++; continue; }
    if (typeof v === 'number' && v > 30000 && v < 60000) { dateCount++; continue; } // Excel serial date
    if (typeof v === 'string') {
      if (/^\d{1,2}[\/-]\d{1,2}[\/-]\d{2,4}$/.test(v)) { dateCount++; continue; }
      if (/^\d{4}[\/-]\d{1,2}[\/-]\d{1,2}$/.test(v)) { dateCount++; continue; }
      const d = new Date(v);
      if (!isNaN(d.getTime()) && v.length > 5) { dateCount++; continue; }
    }
  }
  return dateCount / validValues.length >= 0.5;
}

/**
 * Detect if column values look like numbers
 */
export function looksLikeNumbers(values: unknown[]): boolean {
  const validValues = values.filter(v => v != null && v !== '');
  if (validValues.length === 0) return false;

  let numCount = 0;
  for (const v of validValues.slice(0, 10)) {
    if (typeof v === 'number') { numCount++; continue; }
    if (typeof v === 'string' && !isNaN(parseFloat(v.replace(/[%,]/g, '')))) { numCount++; continue; }
  }
  return numCount / validValues.length >= 0.5;
}

/**
 * Detect if column values look like percentages
 */
export function looksLikePercentages(values: unknown[]): boolean {
  const validValues = values.filter(v => v != null && v !== '');
  if (validValues.length === 0) return false;

  let pctCount = 0;
  for (const v of validValues.slice(0, 10)) {
    if (typeof v === 'string' && v.includes('%')) { pctCount++; continue; }
    if (typeof v === 'number' && v > 0 && v <= 3) { pctCount++; continue; } // decimal percentage
  }
  return pctCount / validValues.length >= 0.4;
}

/**
 * Detect if column values look like person names
 */
export function looksLikeNames(values: unknown[]): boolean {
  const validValues = values.filter(v => v != null && v !== '');
  if (validValues.length === 0) return false;

  // Check if there are few unique values (typical for assignee columns)
  const unique = new Set(validValues.map(v => String(v).trim().toLowerCase()));
  const ratio = unique.size / validValues.length;
  
  // Person columns typically have low cardinality and string values
  let stringCount = 0;
  for (const v of validValues) {
    if (typeof v === 'string' && v.trim().length > 0 && !/^\d+$/.test(v.trim())) {
      stringCount++;
    }
  }
  
  return ratio < 0.5 && stringCount / validValues.length >= 0.8;
}

/**
 * Detect date format from sample values
 */
export function detectDateFormat(values: unknown[]): string {
  for (const v of values) {
    if (typeof v === 'string') {
      if (/^\d{1,2}\/\d{1,2}\/\d{4}$/.test(v)) return 'DD/MM/YYYY';
      if (/^\d{1,2}-\d{1,2}-\d{4}$/.test(v)) return 'DD-MM-YYYY';
      if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(v)) return 'YYYY/MM/DD';
      if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(v)) return 'YYYY-MM-DD';
    }
    if (v instanceof Date) return 'Excel Date';
    if (typeof v === 'number') return 'Excel Serial';
  }
  return 'Auto';
}
