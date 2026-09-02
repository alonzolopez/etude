import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderPractice, type PracticeDeps } from '../src/screens/practice';
import { SessionTimer } from '../src/session';
import { Hotkeys } from '../src/hotkeys';
import type { ExerciseInstance } from '../src/exercises';
import { mountNotation } from '../src/notation';

const notationPlayer = vi.hoisted(() => ({
  controllable: true,
  play: vi.fn(), pause: vi.fn(), toggle: vi.fn(), setVolume: vi.fn(), destroy: vi.fn(),
}));

vi.mock('../src/notation', () => ({
  mountNotation: vi.fn(() => ({ player: notationPlayer, destroy: vi.fn() })),
}));

const deps = (): PracticeDeps => ({
  hotkeys: new Hotkeys(),
  onNext: vi.fn(), onPrev: vi.fn(), onHome: vi.fn(), onBpmChange: vi.fn(),
  metronome: null,
  getVolume: () => 80, setVolume: vi.fn(),
});

const base: ExerciseInstance = {
  category: { key: 'c', name: 'C' },
  exercise: { title: 'Minor Pentatonic', weight: 1 },
  key: 'A minor', position: 5, bpm: 98,
};

function render(over: Partial<ExerciseInstance['exercise']>, instOver: Partial<ExerciseInstance> = {}) {
  document.body.innerHTML = '<div id="app"></div>';
  const inst: ExerciseInstance = { ...base, ...instOver, exercise: { ...base.exercise, ...over } };
  // practice.ts mounts inst.file (the resolved path). Mirror materialize() for
  // literal paths so a test only has to name the file once.
  if (inst.exercise.file && inst.file === undefined) inst.file = inst.exercise.file;
  const timer = new SessionTimer(5, () => 0);
  renderPractice(document.getElementById('app')!, inst, timer, deps());
  return document.getElementById('app')!;
}

describe('renderPractice content area', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('renders title, key line, and bpm readout', () => {
    const app = render({});
    expect(app.textContent).toContain('Minor Pentatonic');
    expect(app.textContent).toContain('A minor · pos 5');
    expect(app.querySelector('.bpm')?.textContent).toContain('98');
  });

  it('soundslice renders a card with an external link, no iframe', () => {
    const app = render({ url: 'https://www.soundslice.com/slices/xFhXc/' });
    const a = app.querySelector('a[target="_blank"]') as HTMLAnchorElement;
    expect(a.href).toContain('soundslice.com');
    expect(a.rel).toContain('noopener');
    expect(app.querySelector('iframe')).toBeNull();
  });

  it('the soundslice card carries title, key line and bpm (spec §3.2)', () => {
    const app = render({ url: 'https://www.soundslice.com/slices/xFhXc/' });
    const card = app.querySelector('.ss-card')!;
    expect(card.textContent).toContain('Minor Pentatonic');
    expect(card.textContent).toContain('A minor · pos 5');
    expect(card.textContent).toContain('98');
    // no description on this exercise: no empty note paragraph
    expect(card.querySelector('.ss-note')).toBeNull();
  });

  it('the soundslice card shows a description when there is one, and omits absent parts', () => {
    const app = render(
      { url: 'https://www.soundslice.com/slices/xFhXc/', description: 'Watch the shifts.' },
      { key: undefined, position: undefined, bpm: undefined },
    );
    const card = app.querySelector('.ss-card')!;
    expect(card.querySelector('.ss-note')?.textContent).toContain('Watch the shifts.');
    expect(card.querySelector('.ss-key')).toBeNull();
    expect(card.querySelector('.ss-bpm')).toBeNull();
  });

  it('youtube renders an iframe with enablejsapi, preserving existing params', () => {
    const app = render({ url: 'https://www.youtube-nocookie.com/embed/x?si=abc' });
    const f = app.querySelector('iframe') as HTMLIFrameElement;
    expect(f.src).toContain('si=abc');
    expect(f.src).toContain('enablejsapi=1');
  });

  it('unknown url hosts render a plain iframe', () => {
    const app = render({ url: 'https://www.mikeslessons.com/groove/?x' });
    expect(app.querySelector('iframe')).toBeTruthy();
  });

  it('hands the stored session volume to the player at mount (spec §4.1)', () => {
    notationPlayer.setVolume.mockClear();
    const app = render({ file: 'notation/test-lick.alphatex' });
    // deps().getVolume() is 80: the embed must not start at its own default
    expect(notationPlayer.setVolume).toHaveBeenCalledWith(80);
    expect(app.querySelector<HTMLInputElement>('[data-vol]')!.value).toBe('80');
  });

  it('text renders the description large, never an empty frame', () => {
    const app = render({ description: 'Practice slowly.' });
    expect(app.querySelector('.text-content')?.textContent).toContain('Practice slowly.');
    expect(app.querySelector('iframe')).toBeNull();
  });

  it('notation shows its description under the staff (spec §3.2)', () => {
    const app = render({
      file: 'notation/guitar/scales/ionian/a/p4.alphatex',
      description: 'Play the CAGED chord grip named in the score title.',
    });
    const note = app.querySelector('.p-note');
    expect(note?.textContent).toContain('Play the CAGED chord grip');
    // a sibling of .p-content, not inside it: alphaTab owns that element
    expect(app.querySelector('.p-content .p-note')).toBeNull();
    expect(note?.previousElementSibling?.classList.contains('p-content')).toBe(true);
  });

  it('notation with no description holds no space open for one', () => {
    const app = render({ file: 'notation/guitar/scales/ionian/a/p4.alphatex' });
    expect(app.querySelector('.p-note')).toBeNull();
  });

  it('does not double up the note on kinds that print their own description', () => {
    const withUrl = render({
      url: 'https://www.soundslice.com/slices/xFhXc/',
      description: 'Watch the shifts.',
    });
    expect(withUrl.querySelector('.p-note')).toBeNull();
    expect(withUrl.querySelector('.ss-note')).not.toBeNull();

    const text = render({ description: 'Practice slowly.' });
    expect(text.querySelector('.p-note')).toBeNull();
    expect(text.querySelector('.text-content')).not.toBeNull();
  });

  it('escapes a description rather than injecting markup', () => {
    const app = render({
      file: 'notation/guitar/scales/ionian/a/p4.alphatex',
      description: 'Find the <b>3rd</b> & 7th',
    });
    const note = app.querySelector('.p-note')!;
    expect(note.querySelector('b')).toBeNull();
    expect(note.textContent).toBe('Find the <b>3rd</b> & 7th');
  });

  it('mounts the resolved path, never the template', () => {
    vi.mocked(mountNotation).mockClear();
    render(
      { file: 'notation/guitar/scales/dorian/{root}/p{position}.alphatex' },
      { file: 'notation/guitar/scales/dorian/a-sharp/p3.alphatex' },
    );
    expect(vi.mocked(mountNotation)).toHaveBeenCalledWith(
      expect.anything(),
      'notation/guitar/scales/dorian/a-sharp/p3.alphatex',
    );
  });
});
