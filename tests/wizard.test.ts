import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderWizard, type WizardDeps, type SessionSelection } from '../src/screens/wizard';
import { Hotkeys } from '../src/hotkeys';
import type { InstrumentContent } from '../src/exercises';

const content: InstrumentContent = {
  instrument: 'Guitar',
  categories: [
    { key: 'scales', name: 'Scales', exercises: [{ title: 'x', weight: 1 }] },
    { key: 'speed', name: 'Speed', exercises: [{ title: 'y', weight: 1 }, { title: 'z', weight: 1 }] },
  ],
};

function setup(onStart: (s: SessionSelection) => void, onStepChange?: (step: number) => void) {
  document.body.innerHTML = '<div id="app"></div>';
  localStorage.clear();
  const hotkeys = new Hotkeys();
  const deps: WizardDeps = {
    instruments: [{ id: 'guitar', name: 'Guitar', file: 'guitar.json', hotkey: 'g' }],
    loadContent: vi.fn(async () => content),
    hotkeys,
    onStart,
    onStepChange,
  };
  const handle = renderWizard(document.getElementById('app')!, deps);
  return { hotkeys, app: document.getElementById('app')!, handle };
}

const press = (hk: Hotkeys, k: string) =>
  hk.handle(new KeyboardEvent('keydown', { key: k, cancelable: true }));

describe('wizard', () => {
  beforeEach(() => { document.body.innerHTML = ''; });

  it('walks instrument → category → duration and starts on enter', async () => {
    const onStart = vi.fn();
    const { hotkeys, app } = setup(onStart);
    expect(app.textContent).toContain('Guitar');
    press(hotkeys, 'g');
    await vi.waitFor(() => expect(app.textContent).toContain('Scales — 1'));
    press(hotkeys, '2'); // Speed
    await vi.waitFor(() => expect(app.querySelector('input')).toBeTruthy());
    press(hotkeys, 'Enter'); // default duration 5
    expect(onStart).toHaveBeenCalledWith(
      expect.objectContaining({ durationMinutes: 5, category: expect.objectContaining({ key: 'speed' }) }),
    );
  });

  it('preset keys populate the box without starting', async () => {
    const onStart = vi.fn();
    const { hotkeys, app } = setup(onStart);
    press(hotkeys, 'g');
    await vi.waitFor(() => expect(app.textContent).toContain('Scales'));
    press(hotkeys, '1');
    await vi.waitFor(() => expect(app.querySelector('input')).toBeTruthy());
    press(hotkeys, '3'); // preset 3 = 15
    const box = app.querySelector('input') as HTMLInputElement;
    expect(box.value).toBe('15');
    expect(onStart).not.toHaveBeenCalled();
  });

  it('rejects an invalid duration with an inline message', async () => {
    const onStart = vi.fn();
    const { hotkeys, app } = setup(onStart);
    press(hotkeys, 'g');
    await vi.waitFor(() => expect(app.textContent).toContain('Scales'));
    press(hotkeys, '1');
    await vi.waitFor(() => expect(app.querySelector('input')).toBeTruthy());
    (app.querySelector('input') as HTMLInputElement).value = 'abc';
    press(hotkeys, 'Enter');
    expect(onStart).not.toHaveBeenCalled();
    expect(app.querySelector('.wizard-error')?.textContent).toContain('minutes');
  });

  it('rejects "15abc" — a parseInt-truncation loophole — with an inline message', async () => {
    const onStart = vi.fn();
    const { hotkeys, app } = setup(onStart);
    press(hotkeys, 'g');
    await vi.waitFor(() => expect(app.textContent).toContain('Scales'));
    press(hotkeys, '1');
    await vi.waitFor(() => expect(app.querySelector('input')).toBeTruthy());
    (app.querySelector('input') as HTMLInputElement).value = '15abc';
    press(hotkeys, 'Enter');
    expect(onStart).not.toHaveBeenCalled();
    expect(app.querySelector('.wizard-error')?.textContent).toContain('minutes');
  });

  it('escape on step 2 returns to step 1', async () => {
    const onStart = vi.fn();
    const { hotkeys, app } = setup(onStart);
    press(hotkeys, 'g');
    await vi.waitFor(() => expect(app.textContent).toContain('Scales'));
    press(hotkeys, 'Escape');
    await vi.waitFor(() => expect(app.textContent).toContain('Guitar'));
    expect(app.textContent).not.toContain('Scales');
  });

  it('escape on step 1 is a no-op', () => {
    const onStart = vi.fn();
    const { hotkeys, app } = setup(onStart);
    expect(app.textContent).toContain('Guitar');
    press(hotkeys, 'Escape');
    expect(app.textContent).toContain('Guitar');
  });

  it('calls onStepChange with 1, 2, 3 as the user walks forward', async () => {
    const onStepChange = vi.fn();
    const { hotkeys, app } = setup(vi.fn(), onStepChange);
    expect(onStepChange).toHaveBeenNthCalledWith(1, 1);
    press(hotkeys, 'g');
    await vi.waitFor(() => expect(app.textContent).toContain('Scales'));
    expect(onStepChange).toHaveBeenNthCalledWith(2, 2);
    press(hotkeys, '1');
    await vi.waitFor(() => expect(app.querySelector('input')).toBeTruthy());
    expect(onStepChange).toHaveBeenNthCalledWith(3, 3);
  });

  it('showStep(3) re-renders the duration step after it has been visited', async () => {
    const onStart = vi.fn();
    const { hotkeys, app, handle } = setup(onStart);
    press(hotkeys, 'g');
    await vi.waitFor(() => expect(app.textContent).toContain('Scales'));
    press(hotkeys, '1');
    await vi.waitFor(() => expect(app.querySelector('input')).toBeTruthy());
    handle.showStep(1);
    expect(app.querySelector('input')).toBeFalsy();
    handle.showStep(3);
    expect(app.querySelector('input')).toBeTruthy();
  });
});
