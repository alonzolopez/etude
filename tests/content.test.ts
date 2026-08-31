import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';

const read = (f: string) => JSON.parse(readFileSync(`public/exercises/${f}`, 'utf8'));

describe('content files', () => {
  const index = read('index.json');

  it('index lists instruments with unique hotkeys', () => {
    const hotkeys = index.instruments.map((i: any) => i.hotkey);
    expect(new Set(hotkeys).size).toBe(hotkeys.length);
    expect(index.instruments.length).toBeGreaterThan(0);
  });

  for (const inst of index.instruments) {
    describe(inst.file, () => {
      const data = read(inst.file);

      it('has uniquely keyed categories', () => {
        const keys = data.categories.map((c: any) => c.key);
        expect(new Set(keys).size).toBe(keys.length);
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
            for (const dead of ['images', 'example', 'backing_track', 'starting_string', 'original_key'])
              expect(ex).not.toHaveProperty(dead);
          }
      });
    });
  }
});
