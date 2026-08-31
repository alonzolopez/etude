import { readFileSync, writeFileSync, copyFileSync } from 'node:fs';

const SRC = '/Users/alonzolopez/projects/guitar-practice-tool';
const old = JSON.parse(readFileSync(`${SRC}/exercises.json`, 'utf8'));

const KEEP = ['title', 'weight', 'url', 'key', 'mode', 'metronome_range', 'description'];
const DROP_TITLES = new Set(['The Altered Scale']); // spec §2.2 item 2

function cleanExercise(ex) {
  const out = {};
  for (const k of KEEP) if (ex[k] !== undefined) out[k] = ex[k];
  if (out.url) out.url = out.url.replaceAll('&amp;', '&'); // spec §2.2 item 4
  return out;
}

function buildInstrument(name, mapKey) {
  const categories = Object.entries(old[mapKey]).map(([key, display]) => ({
    key,
    name: display,
    exercises: (old[key] ?? [])
      .filter((ex) => !DROP_TITLES.has(ex.title))
      .map(cleanExercise),
  }));
  return { instrument: name, categories };
}

const files = {
  'guitar.json': buildInstrument('Guitar', 'guitar_exercises'),
  'bass.json': buildInstrument('Bass', 'bass_exercises'),
  'drums.json': buildInstrument('Drums', 'drum_exercises'),
};

const index = {
  instruments: [
    { id: 'guitar', name: 'Guitar', file: 'guitar.json', hotkey: 'g' },
    { id: 'bass', name: 'Bass', file: 'bass.json', hotkey: 'b' },
    { id: 'drums', name: 'Drums', file: 'drums.json', hotkey: 'd' },
  ],
};

// --- validation before writing (audit figures from spec §2.2) ---
const all = Object.values(files).flatMap((f) => f.categories.flatMap((c) => c.exercises));
const urls = all.filter((e) => e.url).map((e) => e.url);
const count = (fn) => urls.filter(fn).length;
const assert = (cond, msg) => { if (!cond) throw new Error(`MIGRATION FAILED: ${msg}`); };

assert(all.length === 96, `expected 96 exercises, got ${all.length}`);
assert(count((u) => u.includes('soundslice.com')) === 34, 'soundslice count != 34');
assert(count((u) => /youtube(-nocookie)?\.com|youtu\.be/.test(u)) === 14, 'youtube count != 14');
assert(count((u) => u.includes('mikeslessons.com')) === 11, 'groovescribe count != 11');
assert(!urls.some((u) => u.includes('&amp;')), 'unescaped &amp; remains');
assert(!all.some((e) => 'images' in e || 'example' in e || 'backing_track' in e || 'starting_string' in e), 'dead field survived');

writeFileSync('public/exercises/index.json', JSON.stringify(index, null, 2));
for (const [name, data] of Object.entries(files))
  writeFileSync(`public/exercises/${name}`, JSON.stringify(data, null, 2));
copyFileSync(
  `${process.env.HOME}/Library/Application Support/GuitarPracticeTool/assets/ZZZZ-metronome-click-warm.mp3`,
  'public/click.mp3',
);
console.log('migrated', all.length, 'exercises');
