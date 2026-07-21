/**
 * Format a number for display, dropping decimal places when they are zero.
 * Handles Postgres numeric columns that arrive as strings (e.g. "300.00" → "300").
 */
export function fmtNum(n: number | string): string {
  const num = parseFloat(String(n));
  if (isNaN(num)) return '0';
  return num % 1 === 0 ? String(Math.round(num)) : String(num);
}
