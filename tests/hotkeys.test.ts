import { describe, it, expect, beforeEach } from 'vitest';
import { Hotkeys, comboOf } from '../src/hotkeys';

const key = (k: string, over: KeyboardEventInit = {}) =>
  new KeyboardEvent('keydown', { key: k, cancelable: true, bubbles: true, ...over });

describe('comboOf', () => {
  it('normalizes', () => {
    expect(comboOf(key(' '))).toBe('space');
    expect(comboOf(key('ArrowUp', { shiftKey: true }))).toBe('shift+arrowup');
    expect(comboOf(key('G'))).toBe('g');
  });
});

describe('Hotkeys', () => {
  let hk: Hotkeys;
  beforeEach(() => { hk = new Hotkeys(); document.body.innerHTML = ''; });

  it('fires bound handlers and preventDefaults', () => {
    let hits = 0;
    hk.bind('space', () => hits++);
    const e = key(' ');
    hk.handle(e);
    expect(hits).toBe(1);
    expect(e.defaultPrevented).toBe(true);
  });

  it('suspends single keys while an input is focused, but enter still fires', () => {
    document.body.innerHTML = '<input id="box" />';
    (document.getElementById('box') as HTMLInputElement).focus();
    let ones = 0, enters = 0;
    hk.bind('1', () => ones++);
    hk.bind('enter', () => enters++);
    hk.handle(key('1'));
    hk.handle(key('Enter'));
    expect(ones).toBe(0);
    expect(enters).toBe(1);
  });

  it('keeps hotkeys live while a non-text input (the volume slider) is focused', () => {
    document.body.innerHTML = '<input id="vol" type="range" min="0" max="100" />';
    (document.getElementById('vol') as HTMLInputElement).focus();
    let nexts = 0, spaces = 0;
    hk.bind('arrowright', () => nexts++);
    hk.bind('space', () => spaces++);
    hk.handle(key('ArrowRight'));
    const e = key(' ');
    hk.handle(e);
    expect(nexts).toBe(1);
    expect(spaces).toBe(1);
    expect(e.defaultPrevented).toBe(true); // and the page never scrolls
  });

  it('escape blurs a focused input instead of running its binding', () => {
    document.body.innerHTML = '<input id="box" />';
    const box = document.getElementById('box') as HTMLInputElement;
    box.focus();
    let escapes = 0;
    hk.bind('escape', () => escapes++);
    hk.handle(key('Escape'));
    expect(document.activeElement).not.toBe(box);
    expect(escapes).toBe(0);
    hk.handle(key('Escape'));
    expect(escapes).toBe(1);
  });

  it('ignores cmd/ctrl-modified keys', () => {
    let hits = 0;
    hk.bind('h', () => hits++);
    hk.handle(key('h', { metaKey: true }));
    expect(hits).toBe(0);
  });
});
