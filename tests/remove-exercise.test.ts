import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// remove-exercise.mjs is the third and last thing allowed to write
// public/exercises/*.json. Two things must never regress. Byte-level: these
// files are 2-space-indented with NO trailing newline, and a removal must leave
// every other byte alone. And behavioural: deleting content is not the same as
// retiring it, so the script refuses an exercise that carries notation, and
// refuses to empty a category, unless explicitly forced.

const SCRIPT = join(process.cwd(), '.claude/skills/_notation/scripts/remove-exercise.mjs');

let root: string;
const target = () => join(root, 'public/exercises/guitar.json');
const read = () => readFileSync(target(), 'utf8');
const scales = () => JSON.parse(read()).categories.find((c: any) => c.key === 'scales');
const titles = () => scales().exercises.map((e: any) => e.title);

function run(args: string[]): { code: number; out: string } {
  try {
    const out = execFileSync('node', [SCRIPT, `--root=${root}`, ...args], {
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    return { code: 0, out };
  } catch (err: any) {
    return { code: err.status ?? 1, out: `${err.stdout ?? ''}${err.stderr ?? ''}` };
  }
}

// A weight-0 entry with no file and no url — the shape this script exists for.
const BARE = 'Major Blues scale practice';
// A real one, carrying notation.
const WITH_FILE = 'Minor pentatonic scale';
const BASE = ['--instrument=guitar', '--category=scales'];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'etude-remove-'));
  mkdirSync(join(root, 'public'), { recursive: true });
  cpSync(join(process.cwd(), 'public/exercises'), join(root, 'public/exercises'), { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('remove-exercise.mjs', () => {
  it('removes the exercise and reports the new category size', () => {
    const before = titles().length;
    const { code, out } = run([...BASE, `--title=${BARE}`]);
    expect(code).toBe(0);
    expect(out).toContain(`${before} -> ${before - 1}`);
    expect(titles()).not.toContain(BARE);
    expect(titles()).toHaveLength(before - 1);
  });

  it('prints the removed exercise in full so it can be put back', () => {
    const { out } = run([...BASE, `--title=${BARE}`]);
    expect(out).toContain(`"title": "${BARE}"`);
    expect(out).toContain('"weight"');
  });

  it('removes only that exercise, leaving its neighbours in order', () => {
    const before = titles();
    const at = before.indexOf(BARE);
    run([...BASE, `--title=${BARE}`]);
    expect(titles()).toEqual([...before.slice(0, at), ...before.slice(at + 1)]);
  });

  it('touches no other category', () => {
    const sizes = (s: string) =>
      JSON.parse(s).categories.map((c: any) => [c.key, c.exercises.length]);
    const before = sizes(read());
    run([...BASE, `--title=${BARE}`]);
    const after = sizes(read());
    const changed = after.filter(([k, n]: any, i: number) => before[i][0] !== k || before[i][1] !== n);
    expect(changed).toEqual([['scales', before.find(([k]: any) => k === 'scales')[1] - 1]]);
  });

  it('never adds a trailing newline', () => {
    expect(read().endsWith('\n')).toBe(false);
    run([...BASE, `--title=${BARE}`]);
    expect(read().endsWith('\n')).toBe(false);
  });

  it('removes only the lines of that exercise, reformatting nothing', () => {
    const before = read().split('\n');
    run([...BASE, `--title=${BARE}`]);
    const after = read().split('\n');
    // Every surviving line must still appear, in the same relative order.
    const removed = before.length - after.length;
    expect(removed).toBeGreaterThan(0);
    let i = 0;
    for (const line of after) {
      while (i < before.length && before[i] !== line) i++;
      expect(i).toBeLessThan(before.length);
      i++;
    }
  });

  it('matches a title case- and whitespace-insensitively', () => {
    expect(run([...BASE, `--title=  ${BARE.toUpperCase()} `]).code).toBe(0);
    expect(titles()).not.toContain(BARE);
  });

  it('--dry-run reports without writing', () => {
    const original = read();
    const { code, out } = run([...BASE, `--title=${BARE}`, '--dry-run']);
    expect(code).toBe(0);
    expect(out).toContain('DRY RUN');
    expect(read()).toBe(original);
  });

  describe('guards', () => {
    it('refuses an exercise carrying notation, and says to retire it instead', () => {
      const original = read();
      const { code, out } = run([...BASE, `--title=${WITH_FILE}`]);
      expect(code).toBe(6);
      expect(out).toContain('set-weight.mjs --weight=0');
      expect(read()).toBe(original);
    });

    it('--force lifts the notation guard', () => {
      expect(run([...BASE, `--title=${WITH_FILE}`, '--force']).code).toBe(0);
      expect(titles()).not.toContain(WITH_FILE);
    });

    it('refuses to empty a category', () => {
      // Strip the category down to one, then try to take the last.
      let remaining = titles();
      while (remaining.length > 1) {
        const t = remaining.find((x: string) => x !== BARE) ?? remaining[0];
        run([...BASE, `--title=${t}`, '--force']);
        remaining = titles();
      }
      const original = read();
      const { code, out } = run([...BASE, `--title=${remaining[0]}`]);
      expect(code).toBe(6);
      expect(out).toContain('only exercise');
      expect(read()).toBe(original);
    });

    it('reads "--force=false" as bad input, never as force', () => {
      // Presence-tested flags make "=false" mean true. On a destructive tool that
      // is the wrong way to be wrong, so it is refused outright.
      const original = read();
      const { code, out } = run([...BASE, `--title=${WITH_FILE}`, '--force=false']);
      expect(code).toBe(2);
      expect(out).toContain('bare flag');
      expect(read()).toBe(original);
    });
  });

  describe('refuses rather than guessing', () => {
    const cases: [string, string[], number][] = [
      ['an unknown exercise', [...BASE, '--title=No Such Thing'], 3],
      ['an unknown category', ['--instrument=guitar', '--category=nope', `--title=${BARE}`], 5],
      ['an unknown instrument', ['--instrument=kazoo', '--category=scales', `--title=${BARE}`], 2],
      ['a missing --title', [...BASE], 2],
      ['a missing --category', ['--instrument=guitar', `--title=${BARE}`], 2],
      ['an unknown option', [...BASE, `--title=${BARE}`, '--weight=0'], 2],
    ];
    for (const [label, args, want] of cases)
      it(`${label} (exit ${want}), leaving the file untouched`, () => {
        const original = read();
        expect(run(args).code).toBe(want);
        expect(read()).toBe(original);
      });
  });
});
