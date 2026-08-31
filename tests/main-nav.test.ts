import { describe, it, expect, vi } from 'vitest';
import type { InstrumentContent } from '../src/exercises';

// main.ts pulls in the practice screen, which pulls in alphaTab; the wizard-nav
// behavior under test never mounts notation, so stub the module out.
vi.mock('../src/notation', () => ({
  mountNotation: vi.fn(() => ({
    player: { controllable: true, play() {}, pause() {}, toggle() {}, setVolume() {}, destroy() {} },
    destroy() {},
  })),
}));

const content: InstrumentContent = {
  instrument: 'Guitar',
  categories: [
    { key: 'scales', name: 'Scales', exercises: [{ title: 'x', weight: 1 }] },
    { key: 'speed', name: 'Speed', exercises: [{ title: 'y', weight: 1 }] },
  ],
};

const press = (key: string) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true }));

const step = () => document.getElementById('app')!.textContent ?? '';

describe('main.ts wizard history navigation', () => {
  it('back/forward step the live wizard one step at a time without pushing entries', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      json: async () =>
        String(url).includes('index.json')
          ? { instruments: [{ id: 'guitar', name: 'Guitar', file: 'guitar.json', hotkey: 'g' }] }
          : content,
    })));

    await import('../src/main');
    await vi.waitFor(() => expect(step()).toContain('Step 1 of 3'));

    press('g');
    await vi.waitFor(() => expect(step()).toContain('Step 2 of 3'));
    press('1'); // Scales
    await vi.waitFor(() => expect(step()).toContain('Step 3 of 3'));

    // At step 3 the stack is [wizard 1, wizard 2, wizard 3].
    const lengthAtStep3 = window.history.length;
    expect(window.history.state).toEqual({ screen: 'wizard', step: 3 });

    // Back twice must walk 3 -> 2 -> 1. Without the restoringNav guard the wizard's
    // onStepChange would push a fresh entry on each replayed render, truncating the
    // forward stack and pinning the user on step 2.
    window.history.back();
    await vi.waitFor(() => expect(step()).toContain('Step 2 of 3'));
    window.history.back();
    await vi.waitFor(() => expect(step()).toContain('Step 1 of 3'));

    // Forward twice must walk 1 -> 2 -> 3 back up the untouched stack.
    window.history.forward();
    await vi.waitFor(() => expect(step()).toContain('Step 2 of 3'));
    window.history.forward();
    await vi.waitFor(() => expect(step()).toContain('Step 3 of 3'));

    expect(window.history.length).toBe(lengthAtStep3);
    expect(window.history.state).toEqual({ screen: 'wizard', step: 3 });
  });
});
