import { describe, it, expect, vi } from 'vitest';
import type { InstrumentContent } from '../src/exercises';

vi.mock('../src/notation', () => ({
  mountNotation: vi.fn(() => ({
    player: { controllable: true, play() {}, pause() {}, toggle() {}, setVolume() {}, destroy() {} },
    destroy() {},
  })),
}));

// Fixed bpm range: every materialized instance rolls exactly 60, so a bpm of 61
// below can only have come from the user's tweak surviving a back/forward trip.
const content: InstrumentContent = {
  instrument: 'Guitar',
  categories: [
    {
      key: 'scales',
      name: 'Scales',
      exercises: [
        { title: 'Pentatonic', weight: 1, metronome_range: [60, 60], description: 'a' },
        { title: 'Dorian', weight: 1, metronome_range: [60, 60], description: 'b' },
      ],
    },
  ],
};

class FakeAudioContext {
  currentTime = 0;
  destination = {};
  createGain() { return { gain: { value: 1 }, connect() {} }; }
  createBufferSource() { return { buffer: null, connect() {}, start() {} }; }
  async decodeAudioData() { return {}; }
  async resume() {}
}

const press = (key: string, over: KeyboardEventInit = {}) =>
  window.dispatchEvent(new KeyboardEvent('keydown', { key, cancelable: true, ...over }));

const app = () => document.getElementById('app')!;
const text = () => app().textContent ?? '';
const bpm = () => document.querySelector('.bpm')?.textContent ?? '';
const navState = () => window.history.state as { screen: string; cursor?: number };

/** wizard step 1 -> practice, from whatever screen is up. */
async function startSession() {
  await vi.waitFor(() => expect(text()).toContain('Step 1 of 3'));
  press('g');
  await vi.waitFor(() => expect(text()).toContain('Step 2 of 3'));
  press('1');
  await vi.waitFor(() => expect(text()).toContain('Step 3 of 3'));
  press('Enter');
  await vi.waitFor(() => expect(document.querySelector('.practice')).toBeTruthy());
}

describe('main.ts session flow', () => {
  it('gives each session a fresh instance stack, and replays forward within one', async () => {
    document.body.innerHTML = '<div id="app"></div>';
    localStorage.clear();
    vi.stubGlobal('AudioContext', FakeAudioContext);
    vi.stubGlobal('fetch', vi.fn(async (url: string) => ({
      ok: true,
      arrayBuffer: async () => new ArrayBuffer(8), // click.mp3
      json: async () =>
        String(url).includes('index.json')
          ? { instruments: [{ id: 'guitar', name: 'Guitar', file: 'guitar.json', hotkey: 'g' }] }
          : content,
    })));

    await import('../src/main');

    // ---- session 1, then home ----
    await startSession();
    expect(navState()).toEqual({ screen: 'practice', cursor: 0 });
    press('ArrowRight'); // leave a non-empty stack behind
    await vi.waitFor(() => expect(navState()).toEqual({ screen: 'practice', cursor: 1 }));
    press('h');
    await vi.waitFor(() => expect(text()).toContain('Step 1 of 3'));

    // ---- session 2 must not inherit session 1's stack ----
    await startSession();
    expect(navState()).toEqual({ screen: 'practice', cursor: 0 });

    // `←` on the first exercise of a session is a no-op. With a stale stack the
    // cursor would be 1 here, so `←` would walk back into a wizard entry and
    // silently tear the whole session down.
    press('ArrowLeft');
    await new Promise((r) => setTimeout(r, 60)); // let any popstate land
    expect(document.querySelector('.practice')).toBeTruthy();
    expect(navState()).toEqual({ screen: 'practice', cursor: 0 });

    // ---- forward-replay round trip inside this session ----
    press('ArrowRight');
    await vi.waitFor(() => expect(navState()).toEqual({ screen: 'practice', cursor: 1 }));
    press('ArrowRight');
    await vi.waitFor(() => expect(navState()).toEqual({ screen: 'practice', cursor: 2 }));

    press('ArrowUp', { shiftKey: true }); // bpm 60 -> 61, written into the instance
    expect(bpm()).toContain('61');

    press('ArrowLeft');
    await vi.waitFor(() => expect(navState()).toEqual({ screen: 'practice', cursor: 1 }));
    expect(bpm()).toContain('60');

    press('ArrowRight'); // behind the head: replays, never re-draws
    await vi.waitFor(() => expect(navState()).toEqual({ screen: 'practice', cursor: 2 }));
    expect(bpm()).toContain('61'); // a fresh draw would have rolled 60 again
  });
});
