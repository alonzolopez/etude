import { readStore, writeStore } from './storage';

export type ThemePref = 'auto' | 'light' | 'dark';
const KEY = 'etude.theme';

export function getThemePref(): ThemePref {
  const v = readStore(KEY);
  return v === 'light' || v === 'dark' ? v : 'auto';
}

export function applyTheme(): void {
  const pref = getThemePref();
  const root = document.documentElement;
  if (pref === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', pref);
}

export function setThemePref(p: ThemePref): void {
  writeStore(KEY, p);
  applyTheme();
}
