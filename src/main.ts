import './styles/tokens.css';
import './styles/app.css';
import { loadIndex, loadInstrument, materialize, weightedDraw, type Category } from './exercises';
import { InstanceHistory } from './history';
import { SessionTimer } from './session';
import { Hotkeys } from './hotkeys';
import { Metronome, createChime } from './metronome';
import { renderWizard, type SessionSelection } from './screens/wizard';
import { renderPractice } from './screens/practice';
import { applyTheme, getThemePref, setThemePref, type ThemePref } from './theme';
import { readStore, writeStore } from './storage';

const app = document.querySelector<HTMLDivElement>('#app')!;
applyTheme();

// ---- audio (lazy: first user gesture, spec §6) ----
interface Audio { ctx: AudioContext; metronome: Metronome; chime: () => void; gain: GainNode }
// `audio` is the resolved value for the synchronous readers; `audioPromise` makes
// init single-flight, so key-repeat on `enter` at the first start cannot open a
// second AudioContext while the first is still decoding the click.
let audio: Audio | null = null;
let audioPromise: Promise<Audio> | null = null;

async function initAudio(): Promise<Audio> {
  const ctx = new AudioContext();
  const gain = ctx.createGain();
  gain.connect(ctx.destination);
  gain.gain.value = getVolume() / 100;
  const buf = await fetch(`${import.meta.env.BASE_URL}click.mp3`)
    .then((r) => r.arrayBuffer())
    .then((b) => ctx.decodeAudioData(b));
  const a: Audio = { ctx, gain, metronome: new Metronome(ctx, buf, gain), chime: createChime(ctx, gain) };
  a.metronome.setBpm(Number(readStore('etude.bpm') ?? '100')); // spec §9.2 last-bpm
  audio = a;
  return a;
}

function ensureAudio(): Promise<Audio> {
  if (audio) { void audio.ctx.resume(); return Promise.resolve(audio); }
  // Drop a failed attempt so a later gesture can retry instead of being stuck
  // awaiting a permanently rejected promise.
  audioPromise ??= initAudio().catch((err: unknown) => { audioPromise = null; throw err; });
  return audioPromise;
}

function getVolume(): number { return Number(readStore('etude.volume') ?? '80'); }
function setVolume(v: number): void {
  writeStore('etude.volume', String(v));
  if (audio) audio.gain.gain.value = v / 100;
}

// ---- session state ----
const hotkeys = new Hotkeys();
hotkeys.attach();
// Session-scoped: every session starts from an empty instance stack, so `←` on a
// new session's first exercise can never walk into the previous session's entries.
let history = new InstanceHistory();
let session: { category: Category; timer: SessionTimer } | null = null;
let screenHandle: { destroy(): void; tick(): void } | null = null;
let ticker: ReturnType<typeof setInterval> | null = null;
// Non-null exactly while the wizard is the live screen; null while practice is
// mounted (and while the wizard is still loading its content). popstate uses it
// both as the "is the wizard live?" test and as the handle to step it (spec §3.1).
let wizardHandle: { showStep(n: number): void } | null = null;
// True only while a history entry is being replayed into the wizard. The wizard
// fires onStepChange on EVERY step render, including the ones popstate triggers,
// so without this the replay would push new entries while navigating the stack.
let restoringNav = false;
// The wizard step currently on screen. A render of a LOWER step is a backward
// move (`esc`/`←`), which must walk the history stack back, not grow it.
let wizardStep = 1;

// ---- history API: state objects only, never paths (spec §5) ----
type NavState = { screen: 'wizard'; step: number } | { screen: 'practice'; cursor: number };
const pushNav = (s: NavState) => window.history.pushState(s, '');
window.history.replaceState({ screen: 'wizard', step: 1 } satisfies NavState, '');

window.addEventListener('popstate', (e) => {
  const s = e.state as NavState | null;
  // Back/forward inside the live wizard mirrors `esc`: one step at a time (spec §3.1).
  if (s && s.screen === 'wizard' && wizardHandle) {
    restoringNav = true;
    try { wizardHandle.showStep(s.step); } finally { restoringNav = false; }
    return;
  }
  if (!s || s.screen === 'wizard' || !session) { void showWizard(); return; }
  const inst = history.goTo(s.cursor);
  if (inst) showPractice(); else void showWizard();
});

// ---- armed indicator (spec §4.3) ----
window.addEventListener('blur', () => {
  setTimeout(() => {
    if (document.activeElement instanceof HTMLIFrameElement)
      document.body.classList.add('keys-disarmed');
  }, 0);
});
window.addEventListener('focus', () => document.body.classList.remove('keys-disarmed'));

// ---- screens ----
function teardownScreen(): void {
  screenHandle?.destroy();
  screenHandle = null;
  if (ticker !== null) clearInterval(ticker);
  ticker = null;
}

async function showWizard(): Promise<void> {
  teardownScreen();
  // Leaving the session silences the click — the wizard has no `m` binding to
  // stop it with. Deliberately NOT in teardownScreen()/practice destroy(): the
  // metronome must survive every next/previous switch and Soundslice tab-out (§3.2).
  audio?.metronome.stop();
  session = null;
  wizardHandle = null;
  wizardStep = 1; // must precede renderWizard: it fires onStepChange(1) synchronously
  const instruments = await loadIndex();
  wizardHandle = renderWizard(app, {
    instruments,
    loadContent: loadInstrument,
    hotkeys,
    onStart: startSession,
    onStepChange: (step) => {
      if (restoringNav) { wizardStep = step; return; } // replaying a history entry
      const backward = step < wizardStep;
      wizardStep = step;
      // `esc`/`←` is a real back navigation: walk the stack (the resulting popstate
      // re-renders this step under restoringNav) rather than pushing a duplicate.
      if (backward) { window.history.back(); return; }
      if (step > 1) pushNav({ screen: 'wizard', step });
    },
  });
  renderThemeToggle();
}

async function startSession(sel: SessionSelection): Promise<void> {
  await ensureAudio(); // the start interaction is our unlock gesture
  const timer = new SessionTimer(sel.durationMinutes);
  timer.start();
  history = new InstanceHistory(); // fresh stack per session (never inherit the last one)
  session = { category: sel.category, timer };
  drawNext();
}

function drawNext(): void {
  if (!session) return;
  const ex = weightedDraw(session.category.exercises);
  history.push(materialize(ex, session.category));
  pushNav({ screen: 'practice', cursor: history.index });
  showPractice();
}

function showPractice(): void {
  teardownScreen();
  const inst = history.current;
  if (!inst || !session) { void showWizard(); return; }
  wizardHandle = null; // practice is live: popstate must not step a stale wizard
  screenHandle = renderPractice(app, inst, session.timer, {
    hotkeys,
    onNext: () => (history.canGoForward ? window.history.forward() : drawNext()),
    onPrev: () => { if (history.canGoBack) window.history.back(); },
    onHome: () => { void showWizard(); },
    onBpmChange: (bpm) => { history.updateCurrentBpm(bpm); writeStore('etude.bpm', String(bpm)); },
    metronome: audio?.metronome ?? null,
    getVolume,
    setVolume,
  });
  renderThemeToggle();
  ticker = setInterval(() => {
    screenHandle?.tick();
    if (session?.timer.crossedZero()) audio?.chime();
  }, 250);
}

// ---- theme toggle (quiet, both screens; spec §3.2 / §7.3) ----
function renderThemeToggle(): void {
  const order: ThemePref[] = ['auto', 'light', 'dark'];
  const btn = document.createElement('button');
  btn.className = 'theme-toggle';
  btn.textContent = `theme: ${getThemePref()}`;
  btn.addEventListener('click', () => {
    const next = order[(order.indexOf(getThemePref()) + 1) % order.length]!;
    setThemePref(next);
    btn.textContent = `theme: ${next}`;
    if (session && history.current) showPractice(); // re-theme alphaTab (spec §7.3)
  });
  app.append(btn);
}

void showWizard();
