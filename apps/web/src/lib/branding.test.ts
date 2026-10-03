import { describe, it, expect } from 'vitest';
import {
  adjustHexBrightness,
  hexToRgba,
  applyBrandingCssVariables,
  DEFAULT_BRAND_PRIMARY,
  DEFAULT_BRAND_SECONDARY,
} from './branding';

describe('Branding utilities (INK-307)', () => {
  it('adjusts hex brightness lighter and darker', () => {
    const lighter = adjustHexBrightness('#000000', 50);
    expect(lighter).toBe('#808080');

    const darker = adjustHexBrightness('#ffffff', -50);
    expect(darker).toBe('#808080');

    // Clamps to min/max
    expect(adjustHexBrightness('#ffffff', 50)).toBe('#ffffff');
    expect(adjustHexBrightness('#000000', -50)).toBe('#000000');
  });

  it('converts hex to rgba string correctly', () => {
    expect(hexToRgba('#ffffff', 0.5)).toBe('rgba(255, 255, 255, 0.5)');
    expect(hexToRgba('#000000', 1)).toBe('rgba(0, 0, 0, 1)');
    expect(hexToRgba('#ff0000', 0.2)).toBe('rgba(255, 0, 0, 0.2)');
  });

  it('applies CSS variables to document.documentElement', () => {
    applyBrandingCssVariables({
      primaryColor: '#0055ff',
      secondaryColor: '#334155',
    });

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--brand-600')).toBe('#0055ff');
    expect(root.style.getPropertyValue('--brand-secondary')).toBe('#334155');
    expect(root.style.getPropertyValue('--brand-50')).toContain('rgba(');
  });

  it('falls back to default colors when none provided', () => {
    applyBrandingCssVariables(null);

    const root = document.documentElement;
    expect(root.style.getPropertyValue('--brand-600')).toBe(DEFAULT_BRAND_PRIMARY);
    expect(root.style.getPropertyValue('--brand-secondary')).toBe(DEFAULT_BRAND_SECONDARY);
  });
});
