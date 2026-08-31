import { describe, it, expect, beforeEach } from 'vitest';
import { getThemePref, setThemePref, applyTheme } from '../src/theme';

describe('theme', () => {
  beforeEach(() => { localStorage.clear(); document.documentElement.removeAttribute('data-theme'); });

  it('defaults to auto (no stamp)', () => {
    expect(getThemePref()).toBe('auto');
    applyTheme();
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('explicit pref stamps the root and persists', () => {
    setThemePref('dark');
    expect(document.documentElement.getAttribute('data-theme')).toBe('dark');
    expect(getThemePref()).toBe('dark');
  });

  it('back to auto removes the stamp', () => {
    setThemePref('light');
    setThemePref('auto');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });
});
