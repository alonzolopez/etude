#!/usr/bin/env node
// Insert one exercise into public/exercises/<instrument>.json without disturbing
// a single other byte.
//
// These files are 2-space-indented with NO trailing newline. Rewriting one with a
// naive dump (python json.dump, an editor's formatter, a whole-file Write) adds a
// newline and re-wraps arrays, turning a 5-line content change into a 1000-line
// diff. This script is the only thing that should write them.
//
//   node .claude/skills/_notation/scripts/add-exercise.mjs \
//     --instrument=guitar --category=scales \
//     --title="C major scale (8th position)" --weight=2 \
//     --file=notation/guitar/c-major-8th-position.alphatex \
//     [--key="C major,D major"] [--position=1,2,3] [--metronome=60,130] \
//     [--description="..."] [--create-category="Modal Shapes"] [--dry-run]
//
// --file may be a template: {root} expands from --key (the pitch-class slug of
// the rolled key), {position} from --position. Every combination must already
// exist under public/ — the arrays are the coverage declaration for the axes the
// template names, so the script expands the product and refuses any gap.
//
//     --file=notation/guitar/scales/dorian/{root}/p{position}.alphatex \
//     --key="A dorian,A# dorian" --position=1,2,3,4,5
//
// exit 0 = written (or dry run)   2 = bad input   4 = duplicate title
// exit 5 = unknown category       1 = unexpected

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveFile, templateAxes, FILE_AXES } from './expand.mjs';

const DEAD = ['images', 'example', 'backing_track', 'starting_string', 'original_key', 'mode'];
const KNOWN = new Set([
  'root', 'instrument', 'category', 'create-category', 'title', 'weight',
  'file', 'url', 'key', 'position', 'metronome', 'description', 'dry-run', 'force',
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

for (const name of opts.keys()) {
  if (KNOWN.has(name)) continue;
  if (DEAD.includes(name))
    die(2, `"${name}" was removed from the exercise schema and is never read.`,
      `  Dead fields: ${DEAD.join(', ')}. tests/content.test.ts fails if one reappears.`);
  die(2, `unknown option --${name}`, `  Known: ${[...KNOWN].map((k) => '--' + k).join(' ')}`);
}

const ROOT = opts.get('root') ?? resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const EX = resolve(ROOT, 'public/exercises');
if (!existsSync(EX)) die(2, `no public/exercises under ${ROOT}`);

const instrument = opts.get('instrument');
const categoryKey = opts.get('category');
const title = opts.get('title');
if (!instrument) die(2, 'missing --instrument');
if (!categoryKey) die(2, 'missing --category');
if (!title || !title.trim()) die(2, 'missing --title');

// weight is required and meaningful: 0 means deliberately disabled (never drawn),
// which is different from absent.
if (!opts.has('weight')) die(2, 'missing --weight (relative draw weight; 0 = disabled)');
const weight = Number(opts.get('weight'));
if (!Number.isFinite(weight) || weight < 0) die(2, `--weight must be a number >= 0, got ${opts.get('weight')}`);

const index = JSON.parse(readFileSync(resolve(EX, 'index.json'), 'utf8'));
const inst = index.instruments.find((i) => i.id === instrument);
if (!inst)
  die(2, `unknown instrument "${instrument}"`,
    `  Known: ${index.instruments.map((i) => i.id).join(', ')}`);

const targetPath = resolve(EX, inst.file);
const original = readFileSync(targetPath, 'utf8');
const data = JSON.parse(original);

// --- build the exercise, canonical field order -------------------------------
const file = opts.get('file');
const url = opts.get('url');
if (file && url) die(2, 'pass --file or --url, not both (file wins in classify() anyway)');

const list = (name, map = (s) => s) => {
  const raw = opts.get(name);
  if (raw === undefined) return undefined;
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean).map(map);
  return parts.length ? parts : undefined;
};

// The axes are parsed before --file is validated: a templated file expands
// against them, so it cannot be checked until they are known.
const key = list('key');
const position = list('position', (s) => {
  const n = Number(s);
  if (!Number.isInteger(n)) die(2, `--position must be integers, got "${s}"`);
  return n;
});

const axes = file ? templateAxes(file) : new Set();

if (file) {
  if (file.startsWith('public/'))
    die(2, `--file must be relative to public/, not "${file}"`,
      `  Use "${file.slice('public/'.length)}" — tests/content.test.ts checks public/\${ex.file}.`);
  // Applies to templates too: the template still ends in a real extension.
  if (!/\.(alphatex|atex|tex|gpx?|gp[3-7]|musicxml|xml)$/i.test(file))
    die(2, `--file has an extension alphaTab will not route correctly: ${file}`,
      '  alphaTex must end .alphatex/.atex/.tex (src/notation.ts routes text by extension).');

  for (const name of axes)
    if (!FILE_AXES.includes(name))
      die(2, `--file uses an unknown placeholder {${name}}: ${file}`,
        `  Known placeholders: ${FILE_AXES.map((a) => `{${a}}`).join(', ')}. ` +
        'resolveFile() throws on any other, so every draw would fail.');

  if (axes.has('root') && !key)
    die(2, '--file contains {root} but no --key was given',
      '  {root} is the pitch-class slug of the rolled key, so the exercise must declare key[].\n' +
      '  Pass --key="A dorian,A# dorian,B dorian,…".');
  if (axes.has('position') && !position)
    die(2, '--file contains {position} but no --position was given',
      '  {position} is the rolled position, so the exercise must declare position[].\n' +
      '  Pass --position=1,2,3,4,5.');

  if (axes.size) {
    // A template addresses a family. Every combination the app can roll must
    // already be on disk, so the writer enforces the same coverage rule as
    // tests/content.test.ts and fails here rather than at `npm run test`.
    const missing = [];
    let total = 0;
    for (const k of axes.has('root') ? key : [undefined])
      for (const p of axes.has('position') ? position : [undefined]) {
        total++;
        const resolved = resolveFile(file, k, p);
        if (!existsSync(resolve(ROOT, 'public', resolved))) missing.push(resolved);
      }
    if (missing.length)
      die(2, `--file is a template and ${missing.length} of its ${total} files do not exist`,
        missing.map((m) => `    public/${m}`).join('\n') + '\n' +
        '  key[] and position[] are the coverage declaration for the axes the template\n' +
        '  names: list a value only once its file exists. Generate the missing files, or\n' +
        '  narrow --key/--position to what is on disk and add the rest later.');
  } else if (!existsSync(resolve(ROOT, 'public', file))) {
    die(2, `--file points at a file that does not exist: public/${file}`,
      '  Create and validate the notation file first. A file entry pointing at nothing is a broken exercise in production.');
  }
}
if (url && !/^https:\/\//.test(url)) die(2, `--url must start with https:// , got ${url}`);

// position[] with no {position} in the file renders "pos N" over a fixed path —
// an axis that displays but selects nothing. tests/content.test.ts's "never rolls
// an axis its file does not select" rejects it, so refuse to write it.
// key[] without {root} is legitimate: a movable shape uses the key as a prompt.
if (position && !axes.has('position'))
  die(2, '--position was given but --file has no {position} placeholder',
    '  The rolled position would render as "pos N" while the path stayed fixed —\n' +
    '  an axis that displays but selects nothing. Either template the file as\n' +
    '  ".../p{position}.alphatex", or drop --position.');

const metronome = list('metronome', (s) => {
  const n = Number(s);
  if (!Number.isFinite(n)) die(2, `--metronome must be numbers, got "${s}"`);
  return n;
});
if (metronome) {
  if (metronome.length !== 2) die(2, `--metronome needs exactly two values (lo,hi), got ${metronome.length}`);
  if (metronome[0] > metronome[1]) die(2, `--metronome lo must be <= hi, got ${metronome.join(',')}`);
}
const description = opts.get('description');

const exercise = {};
exercise.title = title;
exercise.weight = weight;
if (file) exercise.file = file;
if (url) exercise.url = url;
if (key) exercise.key = key;
if (position) exercise.position = position;
if (metronome) exercise.metronome_range = metronome;
if (description) exercise.description = description;

// --- locate or create the category -------------------------------------------
const createName = opts.get('create-category');
let category = data.categories.find((c) => c.key === categoryKey);

if (category && createName)
  die(2, `--create-category given but "${categoryKey}" already exists in ${inst.file}`,
    '  Drop --create-category to add into the existing category.');

if (!category) {
  if (!createName)
    die(5, `no category "${categoryKey}" in ${inst.file}`,
      `  Existing: ${data.categories.map((c) => c.key).join(', ')}\n` +
      '  To add a new one, pass --create-category="Display Name". Category order is wizard display order.');
  category = { key: categoryKey, name: createName, exercises: [] };
  data.categories.push(category);
}

// Jam-track categories hold slices synced to real recordings. alphaTab synthesis
// loses that sync, so they stay Soundslice cards permanently (spec 2.2) — a
// notation `file` does not belong in one. A url exercise is exactly what does.
if (file && categoryKey.includes('jam_tracks') && !opts.has('force'))
  die(2, `"${categoryKey}" is a jam-track category and --file is notation`,
    '  Jam-track slices are synced to real recordings; alphaTab synthesis loses that\n' +
    '  sync, so they stay Soundslice cards permanently (spec 2.2).\n' +
    '  If the owner has explicitly said this one is not song-synced, pass --force.');

// Titles are how a human refers to an exercise and how find-exercise.mjs locates
// one; two identical titles in a category make both unaddressable.
const clash = category.exercises.find((e) => e.title.trim().toLowerCase() === title.trim().toLowerCase());
if (clash)
  die(4, `"${clash.title}" already exists in ${instrument}/${categoryKey}`,
    `  ${JSON.stringify(clash)}\n  Pick a distinct title, or edit that exercise instead of adding a second one.`);

category.exercises.push(exercise);

// --- write --------------------------------------------------------------------
// No trailing newline: JSON.stringify(data, null, 2) reproduces these files
// byte-for-byte, and adding one would touch the last line of every file.
const out = JSON.stringify(data, null, 2);

const summary =
  `${opts.has('dry-run') ? 'DRY RUN — nothing written' : `WROTE ${inst.file}`}\n` +
  `  ${instrument} / ${categoryKey}${createName ? ` (created: "${createName}")` : ''} ` +
  `-> exercises[${category.exercises.length - 1}]\n` +
  JSON.stringify(exercise, null, 2).split('\n').map((l) => '  ' + l).join('\n');

if (opts.has('dry-run')) {
  console.log(summary);
  process.exit(0);
}

writeFileSync(targetPath, out, 'utf8');

// Prove the write did what it claimed: reparse and confirm the exercise is there
// and nothing else moved.
const reread = readFileSync(targetPath, 'utf8');
if (reread !== out) die(1, 'post-write read back differs from what was written');
const added = JSON.parse(reread).categories.find((c) => c.key === categoryKey)?.exercises.at(-1);
if (!added || added.title !== title) die(1, 'post-write verification: exercise not found where it was inserted');

const grew = reread.split('\n').length - original.split('\n').length;
console.log(summary);
console.log(`\n  diff: +${grew} lines, 0 removed. Run \`git diff --stat\` to confirm.`);
console.log('  Next: npx vitest run tests/content.test.ts');
