export interface Exercise {
  title: string;
  weight: number;
  url?: string;
  file?: string;
  key?: string[];
  position?: number[];
  metronome_range?: [number, number];
  description?: string;
}
export interface Category { key: string; name: string; exercises: Exercise[]; }
export interface Instrument { id: string; name: string; file: string; hotkey: string; }
export interface InstrumentContent { instrument: string; categories: Category[]; }
export type ExerciseKind = 'notation' | 'soundslice' | 'youtube' | 'iframe' | 'text';
export interface ExerciseInstance {
  category: { key: string; name: string };
  exercise: Exercise;
  key?: string;
  position?: number;
  bpm?: number;
  /** `exercise.file` with {root}/{position} expanded — what actually gets mounted. */
  file?: string;
}

export function classify(ex: Exercise): ExerciseKind {
  if (ex.file) return 'notation';
  if (!ex.url) return 'text';
  const host = new URL(ex.url).hostname;
  if (host.endsWith('soundslice.com')) return 'soundslice';
  if (/(^|\.)youtube(-nocookie)?\.com$|(^|\.)youtu\.be$/.test(host)) return 'youtube';
  return 'iframe';
}

export function weightedDraw(list: Exercise[], rand: () => number = Math.random): Exercise {
  const total = list.reduce((s, e) => s + e.weight, 0);
  let roll = rand() * total;
  for (const e of list) {
    roll -= e.weight;
    if (roll < 0) return e;
  }
  return list[list.length - 1]!;
}

function pick<T>(arr: T[], rand: () => number): T {
  return arr[Math.min(arr.length - 1, Math.floor(rand() * arr.length))]!;
}

const ROOT_TOKEN = /^([A-G])([#b]?)/;

/**
 * The pitch-class slug of a key string: "A# dorian" -> "a-sharp".
 * Only the leading note token is read, so the quality ("ionian #5") is ignored.
 * `#` must never survive into a path: fetch() reads it as a URL fragment and
 * silently requests the truncated path instead.
 */
export function rootSlug(key: string): string {
  const m = ROOT_TOKEN.exec(key.trim());
  if (!m) throw new Error(`unparseable key: "${key}"`);
  const accidental = m[2] === '#' ? '-sharp' : m[2] === 'b' ? '-flat' : '';
  return m[1]!.toLowerCase() + accidental;
}

/**
 * One `{name}` placeholder in a `file` template. Shared by resolveFile() and
 * templateAxes() so the two can never disagree about what a placeholder is.
 * Safe to share: String.replace resets lastIndex, matchAll clones the regex.
 */
const PLACEHOLDER = /\{(\w+)\}/g;

/**
 * The axis vocabulary a `file` template may reference: placeholder name -> the
 * value one rolled variant expands it to. This object *is* the vocabulary —
 * resolveFile() reads it and FILE_AXES publishes it, so adding an axis is one
 * entry here plus its roll in materialize().
 */
const AXES: Record<string, (file: string, key?: string, position?: number) => string> = {
  root: (file, key) => {
    if (key === undefined) throw new Error(`{root} needs a rolled key: ${file}`);
    return rootSlug(key);
  },
  position: (file, _key, position) => {
    if (position === undefined) throw new Error(`{position} needs a rolled position: ${file}`);
    return String(position);
  },
};

/**
 * Every axis resolveFile() can expand. tests/content.test.ts asserts its own
 * expansion iterates all of these, so an axis added above without teaching the
 * coverage gate about it is a red test rather than a silent hole in coverage.
 */
export const FILE_AXES: readonly string[] = Object.keys(AXES);

/**
 * The placeholder names a `file` references — the axes a draw must roll to
 * resolve it. A literal path names none, which is why it is one file drawn
 * under many keys rather than many files.
 */
export function templateAxes(file: string): Set<string> {
  return new Set([...file.matchAll(PLACEHOLDER)].map((m) => m[1]!));
}

/**
 * Expand an exercise's `file` against one rolled variant. A path with no
 * placeholders comes back unchanged, so literal `file` values are unaffected.
 */
export function resolveFile(file: string, key?: string, position?: number): string {
  return file.replace(PLACEHOLDER, (_, name: string) => {
    const axis = AXES[name];
    if (!axis) throw new Error(`unknown placeholder {${name}} in ${file}`);
    return axis(file, key, position);
  });
}

export function materialize(
  ex: Exercise,
  category: Category,
  rand: () => number = Math.random,
): ExerciseInstance {
  const inst: ExerciseInstance = {
    category: { key: category.key, name: category.name },
    exercise: ex,
  };
  if (ex.key?.length) inst.key = pick(ex.key, rand);
  if (ex.position?.length) inst.position = pick(ex.position, rand);
  if (ex.metronome_range) {
    const [lo, hi] = ex.metronome_range;
    inst.bpm = lo + Math.min(hi - lo, Math.floor(rand() * (hi - lo + 1)));
  }
  // resolve last: the path depends on the rolls above
  if (ex.file) inst.file = resolveFile(ex.file, inst.key, inst.position);
  return inst;
}

const base = () => import.meta.env.BASE_URL;

export async function loadIndex(): Promise<Instrument[]> {
  const res = await fetch(`${base()}exercises/index.json`);
  if (!res.ok) throw new Error(`exercises index: HTTP ${res.status}`);
  return (await res.json()).instruments as Instrument[];
}

export async function loadInstrument(file: string): Promise<InstrumentContent> {
  const res = await fetch(`${base()}exercises/${file}`);
  if (!res.ok) throw new Error(`${file}: HTTP ${res.status}`);
  return (await res.json()) as InstrumentContent;
}
