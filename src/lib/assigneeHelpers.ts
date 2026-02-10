/**
 * Utilities for parsing and handling multiple assignees
 */

/**
 * Parse a string that may contain multiple assignees
 * Supports formats: "Eddy/Darío", "Eddy, Darío", "Eddy,Darío", "Eddy"
 * @param input - Raw assignee string
 * @returns Array of unique trimmed assignee names
 */
export function parseAssignees(input: string | null | undefined): string[] {
  if (!input || typeof input !== 'string') return [];
  
  const trimmed = input.trim();
  if (!trimmed) return [];
  
  // Split by various delimiters: /, comma
  const separators = /\s*[/,]\s*/;
  const names = trimmed.split(separators)
    .map(name => name.trim())
    .filter(name => name.length > 0)
    .filter((name, index, self) => self.indexOf(name) === index); // Remove duplicates
  
  return names;
}

/**
 * Distribute days/load across multiple assignees equally
 * @param total - Total days or load value
 * @param count - Number of assignees
 * @returns Distributed value per assignee
 */
export function distributeDaysAcrossAssignees(total: number, count: number): number {
  if (count <= 0) return 0;
  return total / count;
}

/**
 * Format assignees array as readable string for display
 * @param assignees - Array of assignee names
 * @returns Formatted string
 */
export function formatAssignees(assignees: string[]): string {
  if (assignees.length === 0) return '';
  if (assignees.length === 1) return assignees[0];
  if (assignees.length === 2) return assignees.join(' / ');
  return assignees.slice(0, 2).join(' / ') + ` +${assignees.length - 2}`;
}
