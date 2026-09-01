import { describe, it, expect } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { resolveFile, templateAxes, FILE_AXES } from '../src/exercises';

const read = (f: string) => JSON.parse(readFileSync(`public/exercises/${f}`, 'utf8'));

/** Axes expand() below knows how to iterate; asserted against FILE_AXES. */
const ITERABLE_AXES = ['root', 'position'];

/**
 * Every notation file an exercise can draw: the literal path, or the cartesian
 * product of the axes its template actually references. An axis the template
 * does not name multiplies nothing — a placeholder-free `file` is one file drawn
 * under many keys (a movable shape, where the drawn key is a transposition
 * prompt), not many files. This is why key[] and position[] are the corpus's
 * coverage declaration *for the axes the template names* — such a value is
 * listed only once its file exists.
 */
function expand(ex: any): string[] {
  if (!ex.file) return [];
  const axes = templateAxes(ex.file);
  for (const name of axes)
    if (!ITERABLE_AXES.includes(name))
      throw new Error(`expand() cannot iterate {${name}} — teach it which array supplies that axis`);
  const keys: (string | undefined)[] =
    axes.has('root') && ex.key?.length ? ex.key : [undefined];
  const positions: (number | undefined)[] =
    axes.has('position') && ex.position?.length ? ex.position : [undefined];
  const out: string[] = [];
  for (const k of keys) for (const p of positions) out.push(resolveFile(ex.file, k, p));
  return out;
}

describe('content files', () => {
  const index = read('index.json');

  it('index lists instruments with unique hotkeys', () => {
    const hotkeys = index.instruments.map((i: any) => i.hotkey);
    expect(new Set(hotkeys).size).toBe(hotkeys.length);
    expect(index.instruments.length).toBeGreaterThan(0);
  });

  it('the coverage gate iterates every axis resolveFile() can expand', () => {
    // Otherwise a new axis — the design's eventual {shape} — resolves at draw
    // time but never multiplies here: materialize() would mount paths this gate
    // never checked while the gate stayed green, its own blind spot.
    expect([...ITERABLE_AXES].sort()).toEqual([...FILE_AXES].sort());
  });

  for (const inst of index.instruments) {
    describe(inst.file, () => {
      const data = read(inst.file);

      it('has uniquely keyed categories', () => {
        const keys = data.categories.map((c: any) => c.key);
        expect(new Set(keys).size).toBe(keys.length);
      });

      it('has no empty category', () => {
        // The wizard offers every category; picking an empty one would draw
        // undefined and throw on start. This is the gate that prevents it.
        const empty = data.categories
          .filter((c: any) => !c.exercises?.length)
          .map((c: any) => c.key);
        expect(empty).toEqual([]);
      });

      it('every notation file an exercise can draw exists under public/', () => {
        const missing: string[] = [];
        for (const cat of data.categories)
          for (const ex of cat.exercises) {
            let paths: string[];
            try {
              paths = expand(ex);
            } catch (e: any) {
              // an unknown placeholder, or one whose axis the exercise never rolls
              missing.push(`${cat.key} / ${ex.title}: ${e.message}`);
              continue;
            }
            for (const p of paths) {
              // existsSync alone is not enough. A file genuinely named with a `#`
              // exists on disk here and on CI, so the gate, the build and the
              // deploy all pass — then fetch() reads the `#` as a URL fragment,
              // requests the truncated path, and the staff renders blank with no
              // error. And macOS is case-insensitive where GitHub Pages is not,
              // so a case slip is otherwise only caught after a push.
              if (/[#?]/.test(p)) missing.push(`${cat.key} / ${ex.title}: fragment/query char in path: ${p}`);
              if (p !== p.toLowerCase()) missing.push(`${cat.key} / ${ex.title}: not lowercase: ${p}`);
              if (!existsSync(`public/${p}`)) missing.push(`${cat.key} / ${ex.title}: ${p}`);
            }
          }
        expect(missing).toEqual([]);
      });

      it('no two variants of one exercise resolve to the same file', () => {
        // Catches a key[] that mixes qualities: "A major blues" and "A minor blues"
        // both slug to root "a" and would silently share one file.
        const collisions: string[] = [];
        for (const cat of data.categories)
          for (const ex of cat.exercises) {
            let paths: string[];
            try { paths = expand(ex); } catch { continue; }
            const dupes = [...new Set(paths.filter((p, i) => paths.indexOf(p) !== i))];
            if (dupes.length) collisions.push(`${cat.key} / ${ex.title}: ${dupes.join(', ')}`);
          }
        expect(collisions).toEqual([]);
      });

      it('an exercise never rolls an axis its file does not select', () => {
        // position[] with no {position} in the file would render "pos N" over a
        // fixed path: an axis that displays but selects nothing, which is the bug
        // this design removes. key[] without {root} is legitimate — a movable
        // shape uses the drawn key as a transposition prompt.
        const lying: string[] = [];
        for (const cat of data.categories)
          for (const ex of cat.exercises)
            if (ex.position?.length && !ex.file?.includes('{position}'))
              lying.push(`${cat.key} / ${ex.title}`);
        expect(lying).toEqual([]);
      });

      it('every exercise is schema-valid', () => {
        for (const cat of data.categories)
          for (const ex of cat.exercises) {
            expect(typeof ex.title).toBe('string');
            expect(ex.weight).toBeGreaterThanOrEqual(0);
            if (ex.url) expect(ex.url).toMatch(/^https:\/\//);
            if (ex.metronome_range) {
              expect(ex.metronome_range).toHaveLength(2);
              expect(ex.metronome_range[0]).toBeLessThanOrEqual(ex.metronome_range[1]);
            }
            for (const dead of ['images', 'example', 'backing_track', 'starting_string', 'original_key', 'mode'])
              expect(ex).not.toHaveProperty(dead);
          }
      });
    });
  }
});
