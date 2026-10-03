export interface BrandingSettings {
  logoUrl?: string | null;
  primaryColor?: string | null;
  secondaryColor?: string | null;
  defaultSenderName?: string | null;
  companyAddress?: string | null;
  emailFooterText?: string | null;
}

export const DEFAULT_BRAND_PRIMARY = '#c2101f';
export const DEFAULT_BRAND_SECONDARY = '#1e293b';

/**
 * Adjusts the brightness of a hex color by a percentage (-100 to +100).
 */
export function adjustHexBrightness(hex: string, percent: number): string {
  const cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length !== 6 && cleanHex.length !== 3) return hex;

  const fullHex =
    cleanHex.length === 3
      ? cleanHex
          .split('')
          .map((c) => c + c)
          .join('')
      : cleanHex;

  const num = parseInt(fullHex, 16);
  if (isNaN(num)) return hex;

  let r = (num >> 16) + Math.round(255 * (percent / 100));
  let g = ((num >> 8) & 0x00ff) + Math.round(255 * (percent / 100));
  let b = (num & 0x0000ff) + Math.round(255 * (percent / 100));

  r = Math.min(255, Math.max(0, r));
  g = Math.min(255, Math.max(0, g));
  b = Math.min(255, Math.max(0, b));

  return `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
}

/**
 * Converts a hex color to an rgba() string.
 */
export function hexToRgba(hex: string, alpha: number): string {
  const cleanHex = hex.replace('#', '').trim();
  if (cleanHex.length !== 6 && cleanHex.length !== 3) return `rgba(194, 16, 31, ${alpha})`;

  const fullHex =
    cleanHex.length === 3
      ? cleanHex
          .split('')
          .map((c) => c + c)
          .join('')
      : cleanHex;

  const num = parseInt(fullHex, 16);
  if (isNaN(num)) return `rgba(194, 16, 31, ${alpha})`;

  const r = (num >> 16) & 255;
  const g = (num >> 8) & 255;
  const b = num & 255;

  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/**
 * Applies custom organisation branding colors dynamically onto :root CSS variables.
 */
export function applyBrandingCssVariables(branding?: BrandingSettings | null) {
  if (typeof document === 'undefined') return;

  const primary = branding?.primaryColor?.trim() || DEFAULT_BRAND_PRIMARY;
  const secondary = branding?.secondaryColor?.trim() || DEFAULT_BRAND_SECONDARY;
  const root = document.documentElement;

  root.style.setProperty('--brand-50', hexToRgba(primary, 0.06));
  root.style.setProperty('--brand-100', hexToRgba(primary, 0.12));
  root.style.setProperty('--brand-200', hexToRgba(primary, 0.24));
  root.style.setProperty('--brand-300', hexToRgba(primary, 0.4));
  root.style.setProperty('--brand-400', adjustHexBrightness(primary, 15));
  root.style.setProperty('--brand-500', adjustHexBrightness(primary, 8));
  root.style.setProperty('--brand-600', primary);
  root.style.setProperty('--brand-700', adjustHexBrightness(primary, -12));
  root.style.setProperty('--brand-800', adjustHexBrightness(primary, -22));
  root.style.setProperty('--brand-900', adjustHexBrightness(primary, -32));
  root.style.setProperty('--brand-secondary', secondary);
}
