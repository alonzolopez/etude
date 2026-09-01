#!/usr/bin/env node
// Read a notation file back out as pitches, so you can check it says what you meant.
//
// validate-notation.mjs proves a file PARSES. It will happily pass a "C minor
// pentatonic" that is actually in D. This walks the parsed model and prints every
// bar as pitch names + fret.string + duration, so authored alphaTex can be checked
// against the request BEFORE any exercise JSON points at it.
//
//   node .claude/skills/_notation/scripts/describe-score.mjs <file> [--expect=C,D,E,F,G,A,B] [--track=N]
//
// exit 0 = parsed and structurally sound   exit 1 = ERROR found   exit 2 = usage
//
// ERRORs are structural facts, not taste: a fret that does not exist on the
// instrument, a bar whose beats do not fill its time signature, or
// an --expect pitch-class set that does not match. Wrong-but-playable notes are
// yours to catch by reading the dump.

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const args = process.argv.slice(2);
const file = args.find((a) => !a.startsWith('--'));
const expectArg = (args.find((a) => a.startsWith('--expect=')) ?? '').split('=')[1];
const trackArg = (args.find((a) => a.startsWith('--track=')) ?? '').split('=')[1];

if (!file) {
  console.error('usage: describe-score.mjs <file> [--expect=C,D,E,F,G,A,B] [--track=N]');
  process.exit(2);
}
if (!existsSync(file)) {
  console.error(`FAIL: no such file: ${file}`);
  process.exit(1);
}

const entry = resolve(REPO, 'node_modules/@coderline/alphatab/dist/alphaTab.mjs');
if (!existsSync(entry)) {
  console.error(`FAIL: alphaTab not installed at ${entry} — run npm install first.`);
  process.exit(1);
}
const alphaTab = await import(pathToFileURL(entry).href);

const isTex = /\.(alphatex|atex|tex)$/i.test(file);
let score;
try {
  const settings = new alphaTab.Settings();
  score = isTex
    ? alphaTab.importer.ScoreLoader.loadAlphaTex(readFileSync(file, 'utf8'), settings)
    : alphaTab.importer.ScoreLoader.loadScoreFromBytes(new Uint8Array(readFileSync(file)), settings);
} catch (err) {
  console.error(`FAIL: alphaTab could not parse ${file}`);
  console.error(`  ${err?.message ?? err}`);
  process.exit(1);
}

const NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const pitchName = (midi) => `${NAMES[((midi % 12) + 12) % 12]}${Math.floor(midi / 12) - 1}`;
const pcName = (midi) => NAMES[((midi % 12) + 12) % 12];
const pcNum = (name) => {
  const m = /^([A-Ga-g])([#b]?)/.exec(name.trim());
  if (!m) return null;
  const base = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 }[m[1].toUpperCase()];
  return (base + (m[2] === '#' ? 1 : m[2] === 'b' ? -1 : 0) + 12) % 12;
};

// Duration enum is the note value itself (Quarter=4, Eighth=8 ...), so ticks per
// beat = whole-note ticks / value. Whole = 4 quarters = 4 * 960.
const QUARTER = 960;
const WHOLE = QUARTER * 4;
const durLabel = (beat) => {
  const d = beat.duration;
  const base = d === 1 ? ':1' : d === 2 ? ':2' : `:${d}`;
  const dots = '.'.repeat(beat.dots ?? 0);
  const tup = beat.tupletNumerator > 0 && beat.tupletNumerator !== beat.tupletDenominator
    ? `{tu ${beat.tupletNumerator}}` : '';
  return `${base}${dots}${tup}`;
};

const errors = [];
const warnings = [];
const seenPcs = new Map(); // pc number -> first-seen name
const seenPerc = new Map(); // output midi -> kit piece name
let totalNotes = 0;

console.log(`FILE   ${file}`);
console.log(`  title  ${JSON.stringify(score.title)}   tempo ${score.tempo}   tracks ${score.tracks.length}`);

const tracks = trackArg !== undefined ? [score.tracks[Number(trackArg)]] : score.tracks;
if (trackArg !== undefined && !tracks[0]) {
  console.error(`FAIL: no track ${trackArg} (score has ${score.tracks.length})`);
  process.exit(1);
}

for (const track of tracks) {
  for (const staff of track.staves) {
    const tuning = staff.tuning ?? [];
    const percussion = staff.isPercussion === true;
    const label = `track ${track.index} "${track.name}" staff ${staff.index}`;
    if (percussion) {
      console.log(`\n${label}  PERCUSSION`);
    } else if (tuning.length) {
      // tuning[] runs highest string first; alphaTex writes fret.string with
      // string 1 = highest. Print it in alphaTex order so it reads like the source.
      console.log(`\n${label}  tuning ${tuning.map(pitchName).join(' ')}  (string 1 = ${pitchName(tuning[0])})`);
    } else {
      console.log(`\n${label}  (no tuning — standard notation staff)`);
    }

    let ts = null;
    staff.bars.forEach((bar, barIdx) => {
      const mb = score.masterBars[barIdx];
      const sig = mb ? `${mb.timeSignatureNumerator}/${mb.timeSignatureDenominator}` : ts;
      if (sig !== ts) {
        ts = sig;
        console.log(`  \\ts ${ts.replace('/', ' ')}`);
      }
      const expectTicks = mb ? mb.timeSignatureNumerator * (WHOLE / mb.timeSignatureDenominator) : null;

      const cells = [];
      let barNotes = 0;
      // Ticks are checked PER VOICE, not summed across the bar. Guitar Pro exports
      // pad unused voices with rests, so a summed total is meaningless — it made
      // every known-good .gpx in public/notation/ report as under-filled.
      const voiceTicks = [];
      for (const voice of bar.voices) {
        let ticks = 0;
        let voiceNotes = 0;
        for (const beat of voice.beats) {
          ticks += beat.playbackDuration;
          if (beat.isRest) {
            cells.push(`${durLabel(beat)} r`);
            continue;
          }
          voiceNotes += beat.notes.length;
          const parts = beat.notes.map((note) => {
            barNotes++;
            totalNotes++;
            if (percussion) {
              // percussionArticulation is an INDEX into track.percussionArticulations,
              // not a MIDI number. Resolve it so drum parts read as kit pieces.
              const art = track.percussionArticulations?.[note.percussionArticulation];
              const name = art?.elementType ?? art?.name ?? `art${note.percussionArticulation}`;
              if (art) seenPerc.set(art.outputMidiNumber, name);
              return `${name}(${art?.outputMidiNumber ?? '?'})`;
            }
            // note.string counts from the LOWEST string up (1 = lowest), the
            // inverse of alphaTex's fret.string. Convert back so the dump can be
            // compared line-for-line against the source text.
            const texString = tuning.length ? tuning.length - note.string + 1 : note.string;
            const open = tuning.length ? tuning[tuning.length - note.string] : null;
            if (open === undefined || open === null) {
              return `?(${note.fret}.${texString})`;
            }
            const midi = note.realValue;
            if (note.fret < 0 || note.fret > 24) {
              errors.push(`bar ${barIdx + 1}: fret ${note.fret} on string ${texString} is off the neck`);
            }
            const pc = ((midi % 12) + 12) % 12;
            if (!seenPcs.has(pc)) seenPcs.set(pc, pcName(midi));
            const tie = note.isTieDestination ? '-' : '';
            return `${tie}${pitchName(midi)}(${note.fret}.${texString})`;
          });
          cells.push(`${durLabel(beat)} ${parts.join(' ')}`);
        }
        // A voice with no notes is Guitar Pro's rest padding — ignore its length.
        if (voiceNotes) voiceTicks.push({ index: voice.index, ticks });
      }

      const short = expectTicks ? voiceTicks.filter((v) => v.ticks !== expectTicks) : [];
      const fill = short.length
        ? `  << voice ${short.map((v) => `${v.index}:${v.ticks}`).join(' ')} vs ${expectTicks} ticks — does not fill ${ts}`
        : '';
      for (const v of short)
        errors.push(`bar ${barIdx + 1}: voice ${v.index} totals ${v.ticks} ticks, ${ts} needs ${expectTicks}`);
      // An all-rest bar is legitimate notation (a bar of silence, or a trailing
      // empty measure in an export), so it warns rather than errors. A file with
      // no notes at all is already caught by validate-notation.mjs.
      if (!barNotes) warnings.push(`bar ${barIdx + 1}: all rests, no notes`);
      const repeat = [
        mb?.isRepeatStart ? '|:' : null,
        mb?.repeatCount > 0 ? `:| x${mb.repeatCount}` : null,
      ].filter(Boolean).join(' ');
      console.log(`  bar ${String(barIdx + 1).padStart(3)}  ${cells.join('  ')}${repeat ? '  ' + repeat : ''}${fill}`);
    });
  }
}

const pcs = [...seenPcs.entries()].sort((a, b) => a[0] - b[0]);
console.log(`\n  notes      ${totalNotes}`);
if (seenPerc.size) {
  const kit = [...seenPerc.entries()].sort((a, b) => a[0] - b[0]);
  console.log(`  kit        ${kit.map(([m, n]) => `${n}(${m})`).join(' ')}   (${kit.length} pieces)`);
}
if (pcs.length) console.log(`  pitch set  ${pcs.map(([, n]) => n).join(' ')}   (${pcs.length} distinct)`);

if (expectArg) {
  // dedupe: an octave-inclusive list like C,D,E,F,G,A,B,C is a fair way to write it
  const want = [...new Set(expectArg.split(',').map(pcNum).filter((n) => n !== null))].sort((a, b) => a - b);
  const got = pcs.map(([n]) => n).sort((a, b) => a - b);
  const same = want.length === got.length && want.every((n, i) => n === got[i]);
  console.log(`  expected   ${expectArg}  ->  ${same ? 'MATCH' : 'MISMATCH'}`);
  if (!same) {
    const missing = want.filter((n) => !got.includes(n)).map((n) => NAMES[n]);
    const extra = got.filter((n) => !want.includes(n)).map((n) => NAMES[n]);
    if (missing.length) console.log(`    missing  ${missing.join(' ')}`);
    if (extra.length) console.log(`    extra    ${extra.join(' ')}`);
    errors.push(`pitch set does not match --expect=${expectArg}`);
  }
}

if (warnings.length) {
  console.log(`\nWARN (${warnings.length}):`);
  for (const w of warnings) console.log(`  - ${w}`);
}

if (errors.length) {
  console.error(`\nERROR (${errors.length}) — do not wire this file into an exercise:`);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}
console.log('\nOK   structurally sound. Read the bars above and confirm they are the notes you asked for.');
