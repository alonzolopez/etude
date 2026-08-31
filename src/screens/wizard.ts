import type { Category, Instrument, InstrumentContent } from '../exercises';
import type { Hotkeys } from '../hotkeys';
import { readStore, writeStore } from '../storage';

export interface SessionSelection {
  instrument: Instrument;
  category: Category;
  durationMinutes: number;
}
export interface WizardDeps {
  instruments: Instrument[];
  loadContent: (file: string) => Promise<InstrumentContent>;
  hotkeys: Hotkeys;
  onStart: (sel: SessionSelection) => void;
  onStepChange?: (step: number) => void;
}

const PRESETS = [5, 10, 15, 20, 30];

export function renderWizard(
  app: HTMLElement,
  deps: WizardDeps,
  startStep = 1,
): { showStep(n: number): void } {
  let instrument: Instrument | null = null;
  let content: InstrumentContent | null = null;
  let lastCategory: Category | null = null;

  const kbd = (k: string) => `<kbd class="kbd">${k}</kbd>`;

  function frame(step: number, prompt: string, body: string): void {
    app.innerHTML = `
      <div class="wizard">
        <p class="eyebrow">Step ${step} of 3 — ${prompt}</p>
        <div class="wizard-options">${body}</div>
        <p class="wizard-hint">${step > 1 ? `${kbd('esc')} back` : ''}</p>
      </div>`;
  }

  function showStep1(): void {
    deps.hotkeys.clear();
    deps.onStepChange?.(1);
    frame(1, 'pick your instrument', deps.instruments
      .map((i) => `<button class="wizard-btn" data-id="${i.id}">${i.name} ${kbd(i.hotkey)}</button>`)
      .join(''));
    for (const i of deps.instruments) {
      const go = () => { instrument = i; void loadStep2(i); };
      deps.hotkeys.bind(i.hotkey, go);
      app.querySelector(`[data-id="${i.id}"]`)!.addEventListener('click', go);
    }
  }

  async function loadStep2(i: Instrument): Promise<void> {
    content = await deps.loadContent(i.file);
    showStep2();
  }

  function showStep2(): void {
    deps.hotkeys.clear();
    deps.onStepChange?.(2);
    const cats = content!.categories;
    frame(2, 'pick a category', cats
      .map((c, n) =>
        `<button class="wizard-btn" data-key="${c.key}">${c.name} — ${c.exercises.length}
         ${n < 9 ? kbd(String(n + 1)) : ''}</button>`)
      .join(''));
    cats.forEach((c, n) => {
      const go = () => showStep3(c);
      if (n < 9) deps.hotkeys.bind(String(n + 1), go);
      app.querySelector(`[data-key="${c.key}"]`)!.addEventListener('click', go);
    });
    deps.hotkeys.bind('escape', showStep1);
    deps.hotkeys.bind('arrowleft', showStep1);
  }

  function showStep3(category: Category): void {
    deps.hotkeys.clear();
    deps.onStepChange?.(3);
    lastCategory = category;
    const last = readStore('etude.duration') ?? '5';
    frame(3, 'how many minutes?', `
      <div class="duration-row">
        <input class="duration-box" inputmode="numeric" value="${last}" aria-label="minutes" />
        <button class="wizard-btn primary" data-start>Start ${kbd('enter')}</button>
      </div>
      <div class="preset-row">
        ${PRESETS.map((m, n) => `<button class="wizard-btn" data-preset="${m}">${m} ${kbd(String(n + 1))}</button>`).join('')}
      </div>
      <p class="wizard-error" role="alert"></p>`);
    const box = app.querySelector<HTMLInputElement>('.duration-box')!;
    const error = app.querySelector<HTMLElement>('.wizard-error')!;
    // box deliberately NOT focused (spec §3.1): hotkeys live on arrival

    const setPreset = (m: number) => { box.value = String(m); error.textContent = ''; };
    PRESETS.forEach((m, n) => {
      deps.hotkeys.bind(String(n + 1), () => setPreset(m));
      app.querySelector(`[data-preset="${m}"]`)!.addEventListener('click', () => setPreset(m));
    });

    const start = () => {
      const raw = box.value.trim();
      const minutes = Number.parseInt(raw, 10);
      if (!/^\d+$/.test(raw) || minutes < 1 || minutes > 600) {
        error.textContent = 'Enter minutes as a whole number from 1 to 600.';
        return;
      }
      writeStore('etude.duration', String(minutes));
      deps.onStart({ instrument: instrument!, category, durationMinutes: minutes });
    };
    deps.hotkeys.bind('enter', start);
    app.querySelector('[data-start]')!.addEventListener('click', start);
    deps.hotkeys.bind('escape', showStep2);
    deps.hotkeys.bind('arrowleft', showStep2);
  }

  showStep1();
  if (startStep > 1) { /* deep re-entry unsupported by design: refresh → wizard step 1 (spec §3.3) */ }
  return {
    showStep: (n) => {
      if (n === 1) showStep1();
      else if (n === 2 && content) showStep2();
      else if (n === 3 && lastCategory) showStep3(lastCategory);
      else if (n === 3 && content) showStep2();
      else if (n === 3) showStep1();
    },
  };
}
