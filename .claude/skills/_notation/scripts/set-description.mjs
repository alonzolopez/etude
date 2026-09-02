#!/usr/bin/env node
// Change one existing exercise's `description` in public/exercises/<instrument>.json
// without disturbing a single other byte.
//
// The fourth thing allowed to write these files. add-exercise.mjs appends,
// set-weight.mjs changes a draw weight, remove-exercise.mjs deletes an entry —
// none of them can reword the body text of an exercise that already exists.
// Doing that by hand (or with a naive dump) re-wraps arrays and adds a trailing
// newline, turning a one-line change into a 1000-line diff.
//
//   node .claude/skills/_notation/scripts/set-description.mjs \
//     --instrument=guitar --category=scales \
//     --title="Ionian scale practice" \
//     --description="Play the CAGED chord grip named in the score title, then ..." \
//     [--dry-run]
//
//   # drop the field entirely
//   ... --title="Ionian scale practice" --clear
//
// --title matches case-insensitively on the trimmed title, the same way
// set-weight.mjs and find-exercise.mjs locate one.
//
// Every exercise kind renders its description (spec §3.2): Soundslice cards and
// text exercises print it inside the content area, notation prints it under the
// staff. So this text is player-facing on every exercise — write it that way.
//
// exit 0 = written (or dry run)   2 = bad input   3 = no such exercise
// exit 5 = unknown category       1 = unexpected

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KNOWN = new Set([
  'root', 'instrument', 'category', 'title', 'description', 'clear', 'dry-run',
]);

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

// Exactly one of the two mutations, so "clear" is always deliberate and never
// something an empty shell variable does by accident.
const clearing = opts.has('clear');
if (clearing && opts.has('description'))
  die(2, '--clear and --description are mutually exclusive');
if (!clearing && !opts.has('description'))
  die(2, 'missing --description (or --clear to drop the field)');

const description = clearing ? undefined : opts.get('description');
if (!clearing && !description.trim())
  die(2, '--description is empty; use --clear to drop the field');

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
    '  The target would be ambiguous. Give them distinct titles first.');

const exercise = matches[0];
const had = Object.hasOwn(exercise, 'description');
const before = exercise.description;

if (clearing) {
  if (!had) die(3, `"${exercise.title}" has no description to clear`);
  delete exercise.description;
} else {
  // Assigning a new key appends it, which is where these files already carry
  // description: last field of the entry. Replacing one keeps its position.
  exercise.description = description;
}

// No trailing newline: JSON.stringify(data, null, 2) reproduces these files
// byte-for-byte, and adding one would touch the last line of every file.
const out = JSON.stringify(data, null, 2);

// A description is one JSON string on one line, so a replace is line-neutral;
// adding the field costs a line and clearing it gives one back. Anything else
// means the dump re-wrapped something it had no business touching.
const expectedDelta = clearing ? -1 : had ? 0 : 1;

const action = clearing ? 'cleared' : had ? (before === description ? 'unchanged' : 'replaced') : 'added';
const summary =
  `${opts.has('dry-run') ? 'DRY RUN — nothing written' : `WROTE ${inst.file}`}\n` +
  `  ${instrument} / ${categoryKey} / "${exercise.title}"\n` +
  `  description ${action}` +
  (clearing || before === description ? '' : `\n  now: ${JSON.stringify(description)}`);

if (opts.has('dry-run')) {
  console.log(summary);
  process.exit(0);
}

writeFileSync(targetPath, out, 'utf8');

// Prove the write did what it claimed: reparse, confirm the new text is there
// and that nothing else moved.
const reread = readFileSync(targetPath, 'utf8');
if (reread !== out) die(1, 'post-write read back differs from what was written');
const after = JSON.parse(reread)
  .categories.find((c) => c.key === categoryKey)
  ?.exercises.find((e) => e.title.trim().toLowerCase() === want);
if (!after) die(1, 'post-write verification: exercise is gone');
if (clearing && Object.hasOwn(after, 'description'))
  die(1, 'post-write verification: description is still present');
if (!clearing && after.description !== description)
  die(1, 'post-write verification: description is not what was written');

const delta = reread.split('\n').length - original.split('\n').length;
if (delta !== expectedDelta)
  die(1, `post-write verification: line count moved by ${delta}, expected ${expectedDelta}`);

console.log(summary);
