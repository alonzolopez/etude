import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// set-weight.mjs is the second thing allowed to write public/exercises/*.json,
// and it exists to change ONE number. The thing that must never regress is
// byte-level: these files are 2-space-indented with NO trailing newline, and a
// weight change must leave every other byte — field order, array wrapping, the
// last line — alone. A whole-file reformat would bury a one-line change in a
// 1000-line diff.

const SCRIPT = join(process.cwd(), '.claude/skills/_notation/scripts/set-weight.mjs');

let root: string;
const target = () => join(root, 'public/exercises/guitar.json');
const read = () => readFileSync(target(), 'utf8');
const parse = () => JSON.parse(read());
const scales = () => parse().categories.find((c: any) => c.key === 'scales');
const find = (title: string) => scales().exercises.find((e: any) => e.title === title);

/** Run the script against the sandbox. Returns exit code + output, never throws. */
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

// An exercise that exists in the real content file and carries notation, so the
// cases below do not depend on the weights this repo happens to ship.
const TITLE = 'Minor pentatonic scale';
const BASE = ['--instrument=guitar', '--category=scales', `--title=${TITLE}`];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'etude-weight-'));
  mkdirSync(join(root, 'public'), { recursive: true });
  cpSync(join(process.cwd(), 'public/exercises'), join(root, 'public/exercises'), { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('set-weight.mjs', () => {
  it('sets the weight and reports the transition', () => {
    const before = find(TITLE).weight;
    const { code, out } = run([...BASE, '--weight=0']);
    expect(code).toBe(0);
    expect(out).toContain(`weight ${before} -> 0`);
    expect(find(TITLE).weight).toBe(0);
  });

  it('changes that one weight and not one other byte', () => {
    const original = read();
    run([...BASE, '--weight=0']);
    const after = read();

    // The only differing lines are the one weight, before and after.
    const o = original.split('\n');
    const a = after.split('\n');
    expect(a.length).toBe(o.length);
    const differing = o
      .map((line, i) => ({ before: line, after: a[i] }))
      .filter((d) => d.before !== d.after);
    expect(differing.length).toBe(1);
    expect(differing[0]?.after).toMatch(/"weight": 0,?$/);
  });

  it('never adds a trailing newline', () => {
    expect(read().endsWith('\n')).toBe(false);
    run([...BASE, '--weight=0']);
    expect(read().endsWith('\n')).toBe(false);
  });

  it('preserves field order within the exercise it touches', () => {
    const before = Object.keys(find(TITLE));
    run([...BASE, '--weight=0']);
    expect(Object.keys(find(TITLE))).toEqual(before);
  });

  it('accepts a fractional weight — the octave-up entries rely on it', () => {
    expect(run([...BASE, '--weight=0.14']).code).toBe(0);
    expect(find(TITLE).weight).toBe(0.14);
  });

  it('is idempotent, and says so rather than claiming a change', () => {
    run([...BASE, '--weight=0']);
    const after = read();
    const { code, out } = run([...BASE, '--weight=0']);
    expect(code).toBe(0);
    expect(out).toContain('unchanged at');
    expect(read()).toBe(after);
  });

  it('--dry-run reports without writing', () => {
    const original = read();
    const { code, out } = run([...BASE, '--weight=0', '--dry-run']);
    expect(code).toBe(0);
    expect(out).toContain('DRY RUN');
    expect(read()).toBe(original);
  });

  it('matches a title case- and whitespace-insensitively', () => {
    expect(run(['--instrument=guitar', '--category=scales', `--title=  ${TITLE.toUpperCase()} `, '--weight=0']).code).toBe(0);
    expect(find(TITLE).weight).toBe(0);
  });

  describe('refuses rather than guessing', () => {
    const cases: [string, string[], number][] = [
      ['an unknown exercise', ['--instrument=guitar', '--category=scales', '--title=No Such Thing', '--weight=0'], 3],
      ['an unknown category', ['--instrument=guitar', '--category=nope', `--title=${TITLE}`, '--weight=0'], 5],
      ['an unknown instrument', ['--instrument=kazoo', '--category=scales', `--title=${TITLE}`, '--weight=0'], 2],
      ['a negative weight', [...BASE, '--weight=-1'], 2],
      ['a non-numeric weight', [...BASE, '--weight=heavy'], 2],
      ['a missing --weight', [...BASE], 2],
      ['a missing --title', ['--instrument=guitar', '--category=scales', '--weight=0'], 2],
      ['an unknown option', [...BASE, '--weight=0', '--file=x.alphatex'], 2],
    ];
    for (const [label, args, want] of cases)
      it(`${label} (exit ${want}), leaving the file untouched`, () => {
        const original = read();
        expect(run(args).code).toBe(want);
        expect(read()).toBe(original);
      });
  });
});
