import { classify, type ExerciseInstance } from '../exercises';
import type { SessionTimer } from '../session';
import type { Hotkeys } from '../hotkeys';
import type { Metronome } from '../metronome';
import { appendParams, createYouTubePlayer, noopPlayer, type Player } from '../players';
import { mountNotation } from '../notation';

export interface PracticeDeps {
  hotkeys: Hotkeys;
  onNext(): void;
  onPrev(): void;
  onHome(): void;
  onBpmChange(bpm: number): void;
  metronome: Metronome | null;
  getVolume(): number;
  setVolume(v: number): void;
}

const esc = (s: string) => s.replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));

function keyLine(inst: ExerciseInstance): string {
  const parts: string[] = [];
  if (inst.key) parts.push(inst.key);
  if (inst.mode !== undefined) parts.push(`mode ${inst.mode}`);
  return parts.join(' · ');
}

export function renderPractice(
  app: HTMLElement,
  inst: ExerciseInstance,
  timer: SessionTimer,
  deps: PracticeDeps,
): { destroy(): void; tick(): void } {
  const kind = classify(inst.exercise);
  const kbd = (k: string) => `<kbd class="kbd">${k}</kbd>`;

  app.innerHTML = `
    <div class="practice">
      <header class="p-top">
        <div>
          <h1 class="p-title">${esc(inst.exercise.title)}</h1>
          <p class="p-key">${esc(keyLine(inst))}</p>
        </div>
        <div class="p-timer" aria-live="off">${timer.formatted()}</div>
      </header>
      <div class="p-content"></div>
      <footer class="p-bottom">
        <div class="metro">
          <span class="lamp"></span>
          <div class="bpm">${inst.bpm ?? '—'}<small>BPM</small></div>
          <div class="stepper">
            <button data-bpm="1" aria-label="bpm up">+</button>
            <button data-bpm="-1" aria-label="bpm down">−</button>
          </div>
          <button class="playbtn" data-metro aria-label="metronome play/pause">▶</button>
        </div>
        <label class="vol"><span>vol</span>
          <input type="range" data-vol min="0" max="100" step="5" aria-label="session volume" />
        </label>
        <div class="spacer"></div>
        <nav class="transport">
          <span class="navbtn"><button data-prev>‹</button>${kbd('←')}</span>
          <span class="navbtn primary"><button data-next>Next ›</button>${kbd('→')}</span>
          <span class="navbtn"><button data-home>Home</button>${kbd('h')}</span>
        </nav>
      </footer>
    </div>`;

  const content = app.querySelector<HTMLElement>('.p-content')!;
  let player: Player = noopPlayer;
  let notationDestroy: (() => void) | null = null;

  if (kind === 'notation') {
    const handle = mountNotation(content, inst.exercise.file!);
    player = handle.player;
    notationDestroy = handle.destroy;
  } else if (kind === 'youtube') {
    const f = document.createElement('iframe');
    f.src = appendParams(inst.exercise.url!, { enablejsapi: '1' });
    f.allow = 'autoplay; encrypted-media';
    f.title = inst.exercise.title;
    content.append(f);
    player = createYouTubePlayer(f);
  } else if (kind === 'iframe') {
    const f = document.createElement('iframe');
    f.src = inst.exercise.url!;
    f.title = inst.exercise.title;
    content.append(f);
  } else if (kind === 'soundslice') {
    // The card is a permanent surface (spec §2.2) and has to stand on its own:
    // title, key line, rolled bpm, description — each only when it exists (§3.2).
    const line = keyLine(inst);
    content.innerHTML = `
      <div class="ss-card">
        <h2 class="ss-title">${esc(inst.exercise.title)}</h2>
        ${line ? `<p class="ss-key">${esc(line)}</p>` : ''}
        ${inst.bpm !== undefined ? `<p class="ss-bpm">${inst.bpm} BPM</p>` : ''}
        ${inst.exercise.description ? `<p class="ss-note">${esc(inst.exercise.description)}</p>` : ''}
        <a class="wizard-btn primary" target="_blank" rel="noopener"
           href="${esc(inst.exercise.url!)}">Open in Soundslice ↗</a>
      </div>`;
  } else {
    content.innerHTML = `<p class="text-content">${esc(
      inst.exercise.description ?? inst.exercise.title,
    )}</p>`;
  }

  // metronome pre-set (the non-negotiable, spec §1)
  const m = deps.metronome;
  const bpmEl = app.querySelector<HTMLElement>('.bpm')!;
  if (m && inst.bpm !== undefined) m.setBpm(inst.bpm);

  const setBpm = (delta: number) => {
    if (!m) return;
    m.setBpm(m.bpm + delta);
    bpmEl.innerHTML = `${m.bpm}<small>BPM</small>`;
    deps.onBpmChange(m.bpm);
  };

  const volEl = app.querySelector<HTMLInputElement>('[data-vol]')!;
  volEl.value = String(deps.getVolume());
  // The one session volume drives the current player (spec §4.1) from the start,
  // not just once the slider is touched: a new embed must never open at its own
  // default. (The YouTube adapter replays this after its widget loads.)
  player.setVolume(deps.getVolume());
  const applyVolume = (v: number) => {
    deps.setVolume(v);
    player.setVolume(v);
    volEl.value = String(v);
  };
  volEl.addEventListener('input', () => applyVolume(Number(volEl.value)));

  const hk = deps.hotkeys;
  hk.clear();
  hk.bind('arrowright', deps.onNext);
  hk.bind('arrowleft', deps.onPrev);
  hk.bind('h', deps.onHome);
  hk.bind('space', () => (player.controllable ? player.toggle() : m?.toggle()));
  hk.bind('m', () => m?.toggle());
  hk.bind('arrowup', () => applyVolume(Math.min(100, deps.getVolume() + 5)));
  hk.bind('arrowdown', () => applyVolume(Math.max(0, deps.getVolume() - 5)));
  hk.bind('shift+arrowup', () => setBpm(1));
  hk.bind('shift+arrowdown', () => setBpm(-1));

  app.querySelector('[data-next]')!.addEventListener('click', deps.onNext);
  app.querySelector('[data-prev]')!.addEventListener('click', deps.onPrev);
  app.querySelector('[data-home]')!.addEventListener('click', deps.onHome);
  app.querySelector('[data-metro]')!.addEventListener('click', () => m?.toggle());
  app.querySelector('[data-bpm="1"]')!.addEventListener('click', () => setBpm(1));
  app.querySelector('[data-bpm="-1"]')!.addEventListener('click', () => setBpm(-1));

  // lamp: flash on scheduled beats (spec §6), skipped under reduced motion
  const lamp = app.querySelector<HTMLElement>('.lamp')!;
  const reduced = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
  if (m && !reduced) {
    m.onBeat = () => {
      lamp.classList.remove('flash');
      void lamp.offsetWidth; // restart animation
      lamp.classList.add('flash');
    };
  }

  const timerEl = app.querySelector<HTMLElement>('.p-timer')!;
  return {
    tick() {
      timerEl.textContent = timer.formatted();
      timerEl.classList.toggle('overtime', timer.isOvertime);
    },
    destroy() {
      if (m) m.onBeat = undefined;
      player.destroy();
      notationDestroy?.();
    },
  };
}
