/** One canonical query form for DTO validation and database normalization. */
export function normalizeSearchQuery(value: string): string {
  return value
    .normalize('NFC')
    .trim()
    .replace(/^@/, '')
    .trim()
    .replace(/\s+/gu, ' ');
}
