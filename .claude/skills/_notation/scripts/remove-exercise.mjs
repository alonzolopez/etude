#!/usr/bin/env node
// Remove one exercise from public/exercises/<instrument>.json without disturbing
// a single other byte.
//
// The third and last thing allowed to write these files, alongside
// add-exercise.mjs (append) and set-weight.mjs (change one weight). They are
// 2-space-indented with NO trailing newline; a naive dump re-wraps every array
// and buries a small change in a 1000-line diff.
//
// Deleting content is not the same as retiring it. Weight 0 keeps an exercise
// listed as a visible TODO and is the right move for one whose notation has not
// been authored yet — reach for set-weight.mjs there. Removal is for an exercise
// that should never come back: one that is permanently superseded, where leaving
// a weight-0 entry behind would read as work still to do. The six diatonic modal
// entries were exactly that — a three-notes-per-string position already IS a
// mode, so "author dorian" was a TODO that must never be completed.
//
//   node .claude/skills/_notation/scripts/remove-exercise.mjs \
//     --instrument=guitar --category=scales \
//     --title="Dorian scale practice" [--force] [--dry-run]
//
// The removed exercise is printed in full so it can be put back by hand from the
// terminal, or recovered with git.
//
// Two guards, both liftable with --force:
//   - an exercise carrying a `file` or `url` is real content, and removing it may
//     orphan notation under public/notation/
//   - emptying a category breaks the wizard (it offers every category, and an
//     empty one draws undefined and throws) — tests/content.test.ts gates this
//
// exit 0 = written (or dry run)   2 = bad input   3 = no such exercise
// exit 5 = unknown category       6 = refused by a guard   1 = unexpected

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const KNOWN = new Set(['root', 'instrument', 'category', 'title', 'force', 'dry-run']);

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

// --force and --dry-run are bare flags, tested by presence. "--force=false" would
// otherwise read as force, which on a destructive tool is the wrong way to be
// wrong: it deletes content the guard was there to protect.
for (const flag of ['force', 'dry-run'])
  if (opts.get(flag) !== undefined && opts.get(flag) !== 'true')
    die(2, `--${flag} is a bare flag, got --${flag}=${opts.get(flag)}`,
      `  Presence means on. Pass --${flag} to enable it, or omit it entirely.`);

const instrument = opts.get('instrument');
const categoryKey = opts.get('category');
const title = opts.get('title');
if (!instrument) die(2, 'missing --instrument');
if (!categoryKey) die(2, 'missing --category');
if (!title || !title.trim()) die(2, 'missing --title');

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
const at = category.exercises.findIndex((e) => e.title.trim().toLowerCase() === want);
if (at === -1)
  die(3, `no exercise titled "${title}" in ${instrument}/${categoryKey}`,
    '  Titles must match exactly (case- and whitespace-insensitive).\n' +
    `  Try: node .claude/skills/_notation/scripts/find-exercise.mjs "${title}"`);

const exercise = category.exercises[at];
const shown = JSON.stringify(exercise, null, 2).split('\n').map((l) => '  ' + l).join('\n');

if ((exercise.file || exercise.url) && !opts.has('force'))
  die(6, `"${exercise.title}" carries ${exercise.file ? 'a notation file' : 'a url'} — this is real content`,
    `${shown}\n` +
    '  Removing it may orphan notation under public/notation/, and an exercise whose\n' +
    '  notation is merely unfinished should be retired with set-weight.mjs --weight=0\n' +
    '  instead, which keeps it listed as a visible TODO.\n' +
    '  Pass --force if it is genuinely superseded and should never come back.');

if (category.exercises.length === 1 && !opts.has('force'))
  die(6, `"${exercise.title}" is the only exercise in ${instrument}/${categoryKey}`,
    '  The wizard offers every category; picking an empty one draws undefined and\n' +
    '  throws. tests/content.test.ts gates this. Remove the category itself, or\n' +
    '  pass --force if you are about to add another exercise to it.');

category.exercises.splice(at, 1);

// No trailing newline: JSON.stringify(data, null, 2) reproduces these files
// byte-for-byte, and adding one would touch the last line of every file.
const out = JSON.stringify(data, null, 2);

const summary =
  `${opts.has('dry-run') ? 'DRY RUN — nothing written' : `WROTE ${inst.file}`}\n` +
  `  removed ${instrument} / ${categoryKey} / exercises[${at}], ` +
  `${category.exercises.length + 1} -> ${category.exercises.length} in the category\n` +
  shown;

if (opts.has('dry-run')) {
  console.log(summary);
  process.exit(0);
}

writeFileSync(targetPath, out, 'utf8');

// Prove the write did what it claimed: reparse, confirm the exercise is gone and
// that exactly one left this category and nothing left any other.
const reread = readFileSync(targetPath, 'utf8');
if (reread !== out) die(1, 'post-write read back differs from what was written');
const back = JSON.parse(reread);
const cat = back.categories.find((c) => c.key === categoryKey);
if (!cat || cat.exercises.some((e) => e.title.trim().toLowerCase() === want))
  die(1, 'post-write verification: the exercise is still there');
if (cat.exercises.length !== category.exercises.length)
  die(1, 'post-write verification: category length is not what was written');

const beforeCounts = JSON.parse(original).categories.map((c) => `${c.key}:${c.exercises.length}`);
const afterCounts = back.categories.map((c) => `${c.key}:${c.exercises.length}`);
const moved = beforeCounts.filter((c, i) => c !== afterCounts[i]);
if (moved.length !== 1)
  die(1, `post-write verification: ${moved.length} categories changed size, expected exactly 1`,
    `  before: ${beforeCounts.join(' ')}\n  after:  ${afterCounts.join(' ')}`);

console.log(summary);
console.log('\n  Next: npx vitest run tests/content.test.ts');
