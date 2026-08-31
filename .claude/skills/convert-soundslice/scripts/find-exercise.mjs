#!/usr/bin/env node
// Locate an exercise across every instrument file by exact title or by url.
// Reports EVERY match — soundslice ids are reused across instruments
// (e.g. gLTHc appears in bass.json, drums.json AND guitar.json), so a url is
// not a unique key. Never guess from a partial match.
//
//   node .claude/skills/convert-soundslice/scripts/find-exercise.mjs "<title | soundslice url | slice id>" [--instrument=guitar|bass|drums]
//
// exit 0 = exactly one match   exit 3 = no match   exit 4 = ambiguous

import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const EX = resolve(REPO, 'public/exercises');
const args = process.argv.slice(2);
const query = args.find((a) => !a.startsWith('--'));
const only = (args.find((a) => a.startsWith('--instrument=')) ?? '').split('=')[1];

if (!query) {
  console.error('usage: find-exercise.mjs "<title | soundslice url | slice id>" [--instrument=guitar|bass|drums]');
  process.exit(2);
}

const read = (f) => JSON.parse(readFileSync(resolve(EX, f), 'utf8'));
const index = read('index.json');
const norm = (s) => s.trim().toLowerCase();
// .../slices/-scqc/ and .../slices/bM1Rc/in-practice-XZsc7/ -> first path segment
const sliceId = (u) => (/soundslice\.com\/slices\/([^/]+)/.exec(u ?? '') ?? [])[1];
const q = norm(query);
const qSlice = sliceId(query) ?? (/^[A-Za-z0-9_-]{4,12}$/.test(query) ? query : undefined);

const exact = [];
const near = [];

for (const inst of index.instruments) {
  if (only && inst.id !== only) continue;
  const data = read(inst.file);
  data.categories.forEach((cat) =>
    cat.exercises.forEach((ex, i) => {
      const hit = {
        instrument: inst.id,
        file: inst.file,
        category: cat.key,
        categoryName: cat.name,
        i,
        ex,
        // Jam-track categories hold slices synced to real recordings; alphaTab
        // synthesis loses that sync, so they stay Soundslice cards by design.
        songSyncRisk: cat.key.includes('jam_tracks'),
      };
      if (norm(ex.title) === q) return void exact.push({ ...hit, why: 'exact title' });
      if (ex.url && norm(ex.url) === q) return void exact.push({ ...hit, why: 'exact url' });
      if (qSlice && ex.url && sliceId(ex.url) === qSlice)
        return void exact.push({ ...hit, why: `slice id ${qSlice}` });
      if (norm(ex.title).includes(q) || q.includes(norm(ex.title)))
        near.push({ ...hit, why: 'partial title' });
    })
  );
}

const show = (m) => {
  const flags = [
    m.ex.file ? `ALREADY CONVERTED -> file: ${m.ex.file}` : null,
    m.songSyncRisk ? 'SONG-SYNC RISK (jam-track category)' : null,
  ].filter(Boolean);
  console.log(`  ${m.instrument}/${m.file}  category ${m.category} (${m.categoryName})  exercises[${m.i}]  [${m.why}]`);
  console.log(`    title: ${JSON.stringify(m.ex.title)}  weight: ${m.ex.weight}  url: ${m.ex.url ?? '(none)'}`);
  if (flags.length) console.log(`    ${flags.join('  |  ')}`);
};

if (exact.length === 1) {
  console.log(`MATCH (1)`);
  show(exact[0]);
  const m = exact[0];
  console.log(`\njson: ${JSON.stringify(m.ex, null, 2).split('\n').join('\n      ')}`);
  if (m.songSyncRisk)
    console.log(`\nSTOP: this exercise sits in "${m.category}". Jam-track slices are synced to real\nrecordings and stay Soundslice cards permanently (spec 2.2). Refuse the conversion\nunless the owner explicitly says this particular slice is not song-synced.`);
  process.exit(0);
}

if (exact.length > 1) {
  console.log(`AMBIGUOUS (${exact.length} exact matches) — do not guess, ask which one:`);
  exact.forEach(show);
  if (!only) console.log('\nIf the owner names the instrument, re-run with --instrument=<guitar|bass|drums>.');
  process.exit(4);
}

console.log('NO EXACT MATCH');
if (near.length) {
  console.log(`\n${near.length} partial title match(es) — candidates only, confirm before using:`);
  near.forEach(show);
} else {
  console.log('\nNo partial matches either. This may be a brand-new exercise (see SKILL.md "No matching exercise").');
}
process.exit(3);
