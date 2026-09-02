#!/usr/bin/env node
// Change one existing exercise's draw weight in public/exercises/<instrument>.json
// without disturbing a single other byte.
//
// add-exercise.mjs only appends. Retiring an exercise from the draw — or bringing
// one back — means editing a value in place, and doing that by hand (or with a
// naive dump) re-wraps arrays and adds a trailing newline, turning a one-line
// change into a 1000-line diff. These two scripts are the only things that
// should write public/exercises/*.json.
//
// Weight 0 is not "delete": the exercise stays in the file, keeps its title and
// metadata, and is simply never drawn (weightedDraw sums weights). That is how
// the owner marks a scale whose notation has not been authored yet — it stays
// visible as a TODO in the content file instead of vanishing.
//
//   node .claude/skills/_notation/scripts/set-weight.mjs \
//     --instrument=guitar --category=scales \
//     --title="Dorian scale practice" --weight=0 [--dry-run]
//
// --title matches case-insensitively on the trimmed title, the same way
// add-exercise.mjs detects duplicates and find-exercise.mjs locates one.
//
// exit 0 = written (or dry run)   2 = bad input   3 = no such exercise
// exit 5 = unknown category       1 = unexpected

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KNOWN = new Set(['root', 'instrument', 'category', 'title', 'weight', 'dry-run']);

const opts = new Map();
for (const raw of process.argv.slice(2)) {
  if (!raw.startsWith('--')) die(2, `unexpected argument: ${raw}`);
  const eq = raw.indexOf('=');
  const name = eq === -1 ? raw.slice(2) : raw.slice(2, eq);
  opts.set(name, eq === -1 ? 'true' : raw.slice(eq + 1));
}

function die(code, msg, extra) {
  console.error(`FAIL: ${msg}`);
  if (extra) console.error(extra);
  process.exit(code);
}

for (const name of opts.keys())
  if (!KNOWN.has(name))
    die(2, `unknown option --${name}`, `  Known: ${[...KNOWN].map((k) => '--' + k).join(' ')}`);

const instrument = opts.get('instrument');
const categoryKey = opts.get('category');
const title = opts.get('title');
if (!instrument) die(2, 'missing --instrument');
if (!categoryKey) die(2, 'missing --category');
if (!title || !title.trim()) die(2, 'missing --title');
if (!opts.has('weight')) die(2, 'missing --weight (relative draw weight; 0 = never drawn)');

const weight = Number(opts.get('weight'));
if (!Number.isFinite(weight) || weight < 0)
  die(2, `--weight must be a number >= 0, got ${opts.get('weight')}`);

const ROOT = opts.get('root') ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const EX = resolve(ROOT, 'public/exercises');
if (!existsSync(EX)) die(2, `no public/exercises under ${ROOT}`);

const index = JSON.parse(readFileSync(resolve(EX, 'index.json'), 'utf8'));
const inst = index.instruments.find((i) => i.id === instrument);
if (!inst)
  die(2, `unknown instrument "${instrument}"`,
    `  Known: ${index.instruments.map((i) => i.id).join(', ')}`);

const targetPath = resolve(EX, inst.file);
const original = readFileSync(targetPath, 'utf8');
const data = JSON.parse(original);

const category = data.categories.find((c) => c.key === categoryKey);
if (!category)
  die(5, `no category "${categoryKey}" in ${inst.file}`,
    `  Existing: ${data.categories.map((c) => c.key).join(', ')}`);

const want = title.trim().toLowerCase();
const matches = category.exercises.filter((e) => e.title.trim().toLowerCase() === want);
if (!matches.length)
  die(3, `no exercise titled "${title}" in ${instrument}/${categoryKey}`,
    '  Titles must match exactly (case- and whitespace-insensitive).\n' +
    `  Try: node .claude/skills/_notation/scripts/find-exercise.mjs "${title}"`);
// add-exercise.mjs refuses duplicate titles, so this can only fire on a file that
// was hand-edited — in which case silently picking the first would be a guess.
if (matches.length > 1)
  die(1, `${matches.length} exercises in ${instrument}/${categoryKey} share the title "${title}"`,
    '  Weight would be ambiguous. Give them distinct titles first.');

const exercise = matches[0];
const before = exercise.weight;
exercise.weight = weight;

// No trailing newline: JSON.stringify(data, null, 2) reproduces these files
// byte-for-byte, and adding one would touch the last line of every file.
const out = JSON.stringify(data, null, 2);

const verb = before === weight ? 'unchanged at' : `${before} -> `;
const summary =
  `${opts.has('dry-run') ? 'DRY RUN — nothing written' : `WROTE ${inst.file}`}\n` +
  `  ${instrument} / ${categoryKey} / "${exercise.title}"\n` +
  `  weight ${verb}${before === weight ? '' : weight}`;

if (opts.has('dry-run')) {
  console.log(summary);
  process.exit(0);
}

writeFileSync(targetPath, out, 'utf8');

// Prove the write did what it claimed: reparse, confirm the new weight is there
// and that nothing else moved.
const reread = readFileSync(targetPath, 'utf8');
if (reread !== out) die(1, 'post-write read back differs from what was written');
const after = JSON.parse(reread)
  .categories.find((c) => c.key === categoryKey)
  ?.exercises.find((e) => e.title.trim().toLowerCase() === want);
if (!after || after.weight !== weight)
  die(1, 'post-write verification: weight is not what was written');

const originalLines = original.split('\n').length;
if (reread.split('\n').length !== originalLines)
  die(1, `post-write verification: line count changed (${originalLines} -> ${reread.split('\n').length})`);

console.log(summary);
