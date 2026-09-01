#!/usr/bin/env node
// Parse-validate a notation file with alphaTab's own importer, headlessly.
// Same importer the app uses at runtime (src/notation.ts), so a pass here means
// the file will render in-page. Run BEFORE editing any exercise JSON.
//
//   node .claude/skills/convert-soundslice/scripts/validate-notation.mjs <file>
//
// exit 0 = parsed, non-empty   exit 1 = parse failed or empty score

import { readFileSync, existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const REPO = resolve(dirname(fileURLToPath(import.meta.url)), '../../../..');
const file = process.argv[2];

if (!file) {
  console.error('usage: validate-notation.mjs <path-to-notation-file>');
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

// alphaTex is text (api.tex() at runtime); everything else is sniffed from bytes.
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
  console.error('  Stop here. Leave the exercise JSON untouched and re-export the slice.');
  process.exit(1);
}

let notes = 0;
for (const t of score.tracks)
  for (const st of t.staves)
    for (const b of st.bars)
      for (const v of b.voices)
        for (const beat of v.beats) notes += beat.notes.length;

const bars = score.masterBars.length;
console.log(`OK   ${file}`);
console.log(`  format      ${isTex ? 'alphaTex (text)' : 'binary, sniffed by alphaTab'}`);
console.log(`  title       ${JSON.stringify(score.title)}`);
console.log(`  artist      ${JSON.stringify(score.artist)}`);
console.log(`  tempo       ${score.tempo}`);
console.log(`  tracks      ${score.tracks.length} — ${score.tracks.map((t) => JSON.stringify(t.name)).join(', ')}`);
console.log(`  bars        ${bars}`);
console.log(`  notes       ${notes}`);

if (!score.tracks.length || !bars || !notes) {
  console.error('FAIL: score parsed but is empty (no tracks, bars, or notes). Do not wire this file up.');
  process.exit(1);
}
