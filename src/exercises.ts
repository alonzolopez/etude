export interface Exercise {
  title: string;
  weight: number;
  url?: string;
  file?: string;
  key?: string[];
  mode?: number[];
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
  mode?: number;
  bpm?: number;
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
  if (ex.mode?.length) inst.mode = pick(ex.mode, rand);
  if (ex.metronome_range) {
    const [lo, hi] = ex.metronome_range;
    inst.bpm = lo + Math.min(hi - lo, Math.floor(rand() * (hi - lo + 1)));
  }
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
