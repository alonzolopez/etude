import { describe, it, expect } from 'vitest';
import * as app from '../src/exercises';
import * as cli from '../.claude/skills/_notation/scripts/expand.mjs';

// The slug and expansion rules live twice: src/exercises.ts for the app, and
// .claude/skills/_notation/scripts/expand.mjs for the CLI writers, which are
// plain .mjs and cannot import TypeScript without Node's experimental type
// stripping and the warnings it prints on every invocation (see expand.mjs's
// header). The design sanctions that duplication on exactly this condition:
// these assertions fail the moment the two drift, so add-exercise.mjs can never
// accept a path the app would resolve differently.

const KEYS = [
  'A# dorian', 'Bb major blues', 'C', 'B major blues', 'A ionian #5',
  'G altered bb7', 'F# lydian #2', 'Eb minor pentatonic', 'a minor', ' D  mixolydian ',
];
const POSITIONS = [1, 2, 5, 12, 0, -1];
const TEMPLATES = [
  'notation/guitar/scales/dorian/{root}/p{position}.alphatex',
  'notation/guitar/scales/minor-pentatonic/{root}/up-the-neck.alphatex',
  'notation/bass/arpeggios/maj7/p{position}.alphatex',
  'notation/guitar/minor-pentatonic.gpx',
  'notation/drums/{root}/{position}/{root}-{position}.alphatex',
  'notation/guitar/{shape}/{root}.alphatex',
  'notation/guitar/{}.alphatex',
];

/** Value or thrown message, so agreement covers the failure paths too. */
function outcome(fn: () => unknown): unknown {
  try {
    return { ok: fn() };
  } catch (e: any) {
    return { threw: e.message };
  }
}

describe('src/exercises.ts and _notation/scripts/expand.mjs agree', () => {
  it('exposes the same axis vocabulary', () => {
    expect([...cli.FILE_AXES].sort()).toEqual([...app.FILE_AXES].sort());
  });

  it('rootSlug agrees on every key, including the unparseable ones', () => {
    for (const k of [...KEYS, 'H minor', '', '1 major'])
      expect(outcome(() => cli.rootSlug(k))).toEqual(outcome(() => app.rootSlug(k)));
  });

  it('templateAxes agrees on every template', () => {
    for (const t of TEMPLATES)
      expect([...cli.templateAxes(t)]).toEqual([...app.templateAxes(t)]);
  });

  it('resolveFile agrees across the full template x key x position product', () => {
    for (const t of TEMPLATES)
      for (const k of [...KEYS, undefined])
        for (const p of [...POSITIONS, undefined])
          expect(outcome(() => cli.resolveFile(t, k, p)))
            .toEqual(outcome(() => app.resolveFile(t, k, p)));
  });
});
