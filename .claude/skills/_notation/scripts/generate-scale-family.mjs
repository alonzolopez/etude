#!/usr/bin/env node
// Regenerate one positional scale family's alphaTex corpus from its shape table.
//
// public/notation/guitar/scales/{minor-pentatonic,ionian,ionian-3nps}/ hold 60,
// 60 and 84 files respectively. Every file in a family is the same fingering
// shape at a different fret offset, with a different title and key signature —
// a pure function of (shape table, root). Hand-editing any one of those files
// risks moving a note by a fret in isolation, or fixing a wrong pitch in one
// root's file while the other eleven keep the mistake: a drift between roots
// that nothing catches until a wrong note turns up in practice. This script is
// the only thing that should write files under public/notation/guitar/scales/ —
// the shape table (authored once at a reference root, transcribed from the
// owner's original notation — see e.g. shapes/minor-pentatonic.json's `note`)
// is the source of truth, and tests/scale-corpus.test.ts regenerates the whole
// committed corpus from these tables on every run to prove the two never drift.
//
// A shape is authored once at `referenceRoot` and moved by ONE fret offset for
// the whole shape when transposed to another root — never per note, which would
// collapse the interval pattern into a broken one. Rule: go up the neck first;
// wrap down an octave if the shape would run off the neck (fret > NECK_CEIL);
// wrap back up if that wrap would put it below fret 1.
//
// Every file plays the same rhythm tree: the shape ascending then descending
// (without repeating the top note), four times over — as quarters, eighths,
// eighth triplets, then sixteenths — each pass padded with rests to fill out
// its last bar.
//
//   node .claude/skills/_notation/scripts/generate-scale-family.mjs \
//     .claude/skills/_notation/shapes/ionian-caged.json [--dry-run] [--roots=A,C]
//
// <shape-table.json> must have dir, keySignature ("major" or "relative-major"),
// titleTemplate ({root}/{position}/{shape}) and shapes[] — see the committed
// tables in .claude/skills/_notation/shapes/ for the schema.
// --roots limits regeneration to specific chromatic roots (default: all 12).
// --dry-run reports what would be written without touching disk.
//
// exit 0 = written (or dry run)   2 = bad input   1 = build failed or a write
// did not verify on read-back

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');

export const NECK_CEIL = 22;
export const PC = { A: 9, 'A#': 10, B: 11, C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8 };
export const ROOTS = ['A', 'A#', 'B', 'C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#'];
export const slug = (r) => r.replace('#', '-sharp').toLowerCase();

// alphaTab takes a note name for \ks. A#, D# and G# major are not real key
// signatures (10, 9 and 8 sharps) — spell those enharmonically or the staff lies.
const MAJOR_KS = { A: 'A', 'A#': 'Bb', B: 'B', C: 'C', 'C#': 'Db', D: 'D', 'D#': 'Eb', E: 'E', F: 'F', 'F#': 'F#', G: 'G', 'G#': 'Ab' };
const nameOfPc = (pc) => ROOTS.find((r) => PC[r] === pc);
export const majorKs = (root) => MAJOR_KS[root];
export const relativeMajorKs = (minorRoot) => MAJOR_KS[nameOfPc((PC[minorRoot] + 3) % 12)];

/** table.keySignature -> the \ks value for one root. */
export function keySignatureFor(table, root) {
  if (table.keySignature === 'major') return majorKs(root);
  if (table.keySignature === 'relative-major') return relativeMajorKs(root);
  throw new Error(`${table.family}: unknown keySignature "${table.keySignature}" (want "major" or "relative-major")`);
}

/** table.titleTemplate with {root}, {position} and {shape} substituted. */
export function titleFor(table, root, shape) {
  return table.titleTemplate
    .replace(/\{root\}/g, root)
    .replace(/\{position\}/g, String(shape.position))
    .replace(/\{shape\}/g, shape.shape ?? '');
}

// Ticks: a quarter is 12, so eighths (6), eighth triplets (4 — three to a
// quarter) and sixteenths (3) are all integers. A 4/4 bar is 48.
const BAR = 48;
const PASSES = [
  { label: 'Quarter', dur: ':4', tick: 12, tuplet: false },
  { label: 'Eighth', dur: ':8', tick: 6, tuplet: false },
  { label: 'Eighth triplet', dur: ':8', tick: 4, tuplet: true },
  { label: 'Sixteenth', dur: ':16', tick: 3, tuplet: false },
];
const REST_UNITS = [[24, ':2'], [12, ':4'], [6, ':8'], [3, ':16']];

/** One fret offset for the whole shape — never per note. */
export function shapeOffset(refPc, targetPc, minFret, maxFret) {
  let o = (targetPc - refPc + 12) % 12;
  if (maxFret + o > NECK_CEIL) o -= 12;
  if (minFret + o < 1) o += 12;
  return o;
}

/** ascend, then descend without repeating the top note */
const runOf = (ascending) => [...ascending, ...ascending.slice(0, -1).reverse()];

/**
 * One rhythm pass, as an array of bar strings. Bar lines are explicit: alphaTab
 * will not infer them, and a bar that does not fill its time signature is exactly
 * what describe-score flags.
 */
function passBars(seq, { dur, tick, tuplet }) {
  const events = [];
  const notes = seq.map(([f, s]) => (tuplet ? `${f}.${s}{tu 3}` : `${f}.${s}`));
  // A triplet group is three notes; a partial group cannot be notated.
  if (tuplet) while (notes.length % 3 !== 0) notes.push('r{tu 3}');
  for (const tok of notes) events.push({ tok, dur, ticks: tick });

  let tail = (BAR - ((notes.length * tick) % BAR)) % BAR;
  for (const [t, d] of REST_UNITS) {
    while (tail >= t) { events.push({ tok: 'r', dur: d, ticks: t }); tail -= t; }
  }
  if (tail !== 0) throw new Error(`rest padding left ${tail} ticks unplaced`);

  const bars = [];
  let line = [], at = 0, curDur = null;
  for (const e of events) {
    if (e.dur !== curDur) { line.push(e.dur); curDur = e.dur; }
    line.push(e.tok);
    at += e.ticks;
    if (at % BAR === 0) { bars.push(line.join(' ')); line = []; }
  }
  if (line.length) throw new Error('pass did not end on a bar line');
  return bars;
}

/** The alphaTex text for one (table, shape, root). */
export function buildFile(table, shape, root, { title, ks }) {
  const frets = shape.ascending.map(([f]) => f);
  const o = shapeOffset(table.referenceRootPitchClass, PC[root], Math.min(...frets), Math.max(...frets));
  const moved = shape.ascending.map(([f, s]) => [f + o, s]);
  for (const [f] of moved) {
    if (f < 1 || f > NECK_CEIL) {
      throw new Error(`${table.family} ${root} p${shape.position}: fret ${f} off the neck`);
    }
  }

  const seq = runOf(moved);
  const chunks = [];
  for (const p of PASSES) {
    chunks.push({ section: p.label });
    for (const bar of passBars(seq, p)) chunks.push({ bar });
  }

  const bodyBars = chunks.filter((c) => c.bar).length;
  let seen = 0;
  const body = chunks
    .map((c) => {
      if (c.section) return `\\section ${c.section}`;
      seen += 1;
      return seen < bodyBars ? `${c.bar} |` : c.bar;
    })
    .join('\n');

  return `\\title "${title}"\n\\ks ${ks}\n\\ts 4 4\n\\tempo 100\n.\n${body}`;
}

/** Where one (table, root, shape) file lives on disk. */
export function outputPath(table, root, shape, repoRoot = REPO) {
  return resolve(repoRoot, `public/notation/guitar/scales/${table.dir}/${slug(root)}/p${shape.position}.alphatex`);
}

/**
 * Every file a shape table describes, as { path, content } — no I/O. This is
 * the whole reason the generator is exported rather than inlined into a CLI:
 * tests/scale-corpus.test.ts calls this directly and diffs the result against
 * public/notation/guitar/scales/ byte for byte, so the committed corpus and the
 * shape tables can never drift apart silently.
 */
export function planFamily(table, { roots = ROOTS, repoRoot = REPO } = {}) {
  const plan = [];
  for (const root of roots) {
    if (!(root in PC)) throw new Error(`unknown root "${root}" — want one of ${ROOTS.join(', ')}`);
    for (const shape of table.shapes) {
      const content = buildFile(table, shape, root, {
        title: titleFor(table, root, shape),
        ks: keySignatureFor(table, root),
      });
      plan.push({ path: outputPath(table, root, shape, repoRoot), root, position: shape.position, content });
    }
  }
  return plan;
}

// --- CLI ------------------------------------------------------------------
// Guarded behind this check so tests can `import` the pure functions above
// without triggering the CLI's argv parsing (which would process.exit(2) on an
// empty argv the moment vitest loaded the module).
const isMain = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (isMain) main();

function die(code, msg, extra) {
  console.error(`FAIL: ${msg}`);
  if (extra) console.error(extra);
  process.exit(code);
}

function main() {
  const args = process.argv.slice(2);
  const tablePath = args.find((a) => !a.startsWith('--'));
  const dryRun = args.includes('--dry-run');
  const rootsArg = (args.find((a) => a.startsWith('--roots=')) ?? '').split('=')[1];

  if (!tablePath)
    die(2, 'usage: generate-scale-family.mjs <shape-table.json> [--dry-run] [--roots=A,C]');
  if (!existsSync(tablePath)) die(2, `no such shape table: ${tablePath}`);

  const table = JSON.parse(readFileSync(tablePath, 'utf8'));
  for (const field of ['family', 'dir', 'referenceRoot', 'referenceRootPitchClass', 'keySignature', 'titleTemplate', 'shapes'])
    if (table[field] === undefined)
      die(2, `${tablePath} is missing required field "${field}"`,
        '  Self-describing tables need family, dir, referenceRoot, referenceRootPitchClass,\n' +
        '  keySignature, titleTemplate and shapes[] — see .claude/skills/_notation/shapes/ for examples.');

  let roots = ROOTS;
  if (rootsArg) {
    roots = rootsArg.split(',').map((s) => s.trim()).filter(Boolean);
    for (const r of roots)
      if (!(r in PC)) die(2, `--roots has an unknown root "${r}"`, `  Known: ${ROOTS.join(', ')}`);
  }

  let plan;
  try {
    plan = planFamily(table, { roots });
  } catch (err) {
    die(1, err.message);
  }

  if (dryRun) {
    console.log(`DRY RUN — nothing written. ${plan.length} file(s) for "${table.family}" would be written:`);
    for (const { path } of plan) console.log(`  ${path}`);
    process.exit(0);
  }

  for (const { path, content } of plan) {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, content, 'utf8');
  }

  // Prove the write did what it claimed: reread every file and compare bytes.
  const bad = plan.filter(({ path, content }) => readFileSync(path, 'utf8') !== content);
  if (bad.length)
    die(1, `post-write verification failed for ${bad.length} of ${plan.length} file(s)`,
      bad.map((b) => `  ${b.path}`).join('\n'));

  console.log(`WROTE ${plan.length} file(s) for "${table.family}" under public/notation/guitar/scales/${table.dir}/`);
  console.log(`  roots: ${roots.join(', ')}`);
  console.log('  Next: git status public/notation/guitar/scales/ to confirm the diff is what you expect.');
}
