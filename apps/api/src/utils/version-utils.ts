/**
 * Semantic version helper utilities for Agreement lifecycle.
 * - Initial draft: '0.1'
 * - Draft updates: increment minor ('0.1' -> '0.2' -> '0.3')
 * - Active agreements: major versions ('1.0', '2.0', etc.)
 */

/**
 * Increments the minor version of a semantic version string.
 * e.g., '0.1' -> '0.2', '1.0' -> '1.1', '1.9' -> '1.10'
 */
export function incrementMinorVersion(version: string | number | undefined | null): string {
  if (!version) return '0.1';
  const str = String(version);
  const parts = str.split('.');
  const major = parseInt(parts[0] || '0', 10);
  const minor = parseInt(parts[1] || '0', 10);
  return `${major}.${minor + 1}`;
}

/**
 * Bumps a version string to the next major version with zero minor.
 * e.g., '0.1' -> '1.0', '0.5' -> '1.0', '1.2' -> '2.0', '1.0' -> '2.0'
 */
export function bumpToMajorVersion(version: string | number | undefined | null): string {
  if (!version) return '1.0';
  const str = String(version);
  const parts = str.split('.');
  const major = parseInt(parts[0] || '0', 10);
  return `${major + 1}.0`;
}

/**
 * Checks if a version string is a major version (e.g. '1.0', '2.0', '3.0').
 */
export function isMajorVersion(version: string | number | undefined | null): boolean {
  if (!version) return false;
  const str = String(version);
  const parts = str.split('.');
  const major = parseInt(parts[0] || '0', 10);
  const minor = parseInt(parts[1] || '0', 10);
  return major >= 1 && minor === 0;
}

/**
 * Formats a version string with a 'v' prefix for display.
 * e.g., '0.1' -> 'v0.1', '1.0' -> 'v1.0'
 */
export function formatVersionDisplay(version: string | number | undefined | null): string {
  if (!version) return 'v0.1';
  const str = String(version);
  const clean = str.startsWith('v') || str.startsWith('V') ? str.substring(1) : str;
  return `v${clean}`;
}
