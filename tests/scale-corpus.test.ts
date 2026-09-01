import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

// generate-scale-family.mjs is the ONLY thing that should write files under
// public/notation/guitar/scales/: the shape tables in
// .claude/skills/_notation/shapes/ are the source of truth, and every committed
// file there is a pure function of (table, root). Without this test, a hand
// edit to one committed file or one shape table would drift silently — nobody
// would notice until a wrong note turned up in practice. This regenerates the
// entire 204-file corpus in memory on every run and diffs it against disk byte
// for byte.
import { planFamily } from '../.claude/skills/_notation/scripts/generate-scale-family.mjs';

const SHAPES_DIR = join(process.cwd(), '.claude/skills/_notation/shapes');
const SCALES_DIR = join(process.cwd(), 'public/notation/guitar/scales');

const TABLE_FILES = ['minor-pentatonic.json', 'ionian-caged.json', 'ionian-3nps.json'];

/** Every .alphatex file under `dir`, recursively, as absolute paths. */
function walkAlphatex(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkAlphatex(p));
    else if (entry.name.endsWith('.alphatex')) out.push(p);
  }
  return out;
}

describe('the committed scale corpus is reproducible from its shape tables', () => {
  for (const tableFile of TABLE_FILES) {
    const table = JSON.parse(readFileSync(join(SHAPES_DIR, tableFile), 'utf8'));

    describe(`${tableFile} (dir: ${table.dir})`, () => {
      const plan = planFamily(table);

      it('regenerates a non-empty family', () => {
        expect(plan.length).toBeGreaterThan(0);
      });

      it('regenerates every committed file byte-identically', () => {
        for (const { path, root, position } of plan) {
          const onDisk = readFileSync(path, 'utf8');
          const regenerated = plan.find((p) => p.path === path)!.content;
          expect(onDisk, `${table.family} ${root} p${position}: public/notation/... differs from a fresh regeneration of ${tableFile}`)
            .toBe(regenerated);
        }
      });

      it('accounts for exactly the files on disk under its dir — no orphans, no gaps', () => {
        const onDisk = walkAlphatex(join(SCALES_DIR, table.dir)).sort();
        const planned = plan.map((p) => p.path).sort();
        expect(onDisk).toEqual(planned);
      });
    });
  }

  it('totals the 204 files documented in CLAUDE.md (60 minor-pentatonic + 60 ionian + 84 ionian-3nps)', () => {
    const total = TABLE_FILES
      .map((f) => JSON.parse(readFileSync(join(SHAPES_DIR, f), 'utf8')))
      .reduce((n, table) => n + planFamily(table).length, 0);
    expect(total).toBe(204);
  });
});
