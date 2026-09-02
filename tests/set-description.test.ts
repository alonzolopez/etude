import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { spawnSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// set-description.mjs is the fourth thing allowed to write public/exercises/*.json,
// and it exists to reword ONE string. Same byte-level contract as set-weight:
// 2-space indent, NO trailing newline, and every other byte left alone. The one
// difference is that adding or clearing the field legitimately moves the line
// count by one, so "nothing else moved" is a delta, not always zero.

const SCRIPT = join(process.cwd(), '.claude/skills/_notation/scripts/set-description.mjs');

let root: string;
const target = () => join(root, 'public/exercises/guitar.json');
const read = () => readFileSync(target(), 'utf8');
const parse = () => JSON.parse(read());
const scales = () => parse().categories.find((c: any) => c.key === 'scales');
const find = (title: string) => scales().exercises.find((e: any) => e.title === title);

// spawnSync rather than execFileSync: it hands back both streams whatever the
// exit code, so a case never has to know which one it is asserting against.
function run(args: string[]): { code: number; out: string } {
  const r = spawnSync('node', [SCRIPT, `--root=${root}`, ...args], { encoding: 'utf8' });
  return { code: r.status ?? 1, out: `${r.stdout ?? ''}${r.stderr ?? ''}` };
}

// Carries notation AND a description — the shape this script was written for.
const TITLE = 'Minor pentatonic scale';
// A different exercise in the same category, to prove edits stay put.
const TEXT_TITLE = 'The Chromatic Scale';
const BASE = ['--instrument=guitar', '--category=scales', `--title=${TITLE}`];
const NEW = 'Play the chord grip first, then the scale around it.';

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'etude-desc-'));
  mkdirSync(join(root, 'public'), { recursive: true });
  cpSync(join(process.cwd(), 'public/exercises'), join(root, 'public/exercises'), { recursive: true });
});

afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('set-description.mjs', () => {
  it('replaces the description and reports it', () => {
    const { code, out } = run([...BASE, `--description=${NEW}`]);
    expect(code).toBe(0);
    expect(out).toContain('description replaced');
    expect(find(TITLE).description).toBe(NEW);
  });

  it('changes that one string and not one other byte', () => {
    const original = read();
    run([...BASE, `--description=${NEW}`]);
    const after = read();

    const o = original.split('\n');
    const a = after.split('\n');
    expect(a.length).toBe(o.length);
    const differing = o
      .map((line, i) => ({ before: line, after: a[i] }))
      .filter((d) => d.before !== d.after);
    expect(differing.length).toBe(1);
    expect(differing[0]?.after).toContain(NEW);
  });

  it('never adds a trailing newline', () => {
    run([...BASE, `--description=${NEW}`]);
    expect(read().endsWith('\n')).toBe(false);
  });

  it('leaves every other exercise untouched', () => {
    const before = scales().exercises.length;
    run([...BASE, `--description=${NEW}`]);
    expect(scales().exercises.length).toBe(before);
    expect(find(TEXT_TITLE).description).toContain('Rhythm Tree');
  });

  it('reports "unchanged" when the text already matches', () => {
    const current = find(TITLE).description;
    const { code, out } = run([...BASE, `--description=${current}`]);
    expect(code).toBe(0);
    expect(out).toContain('description unchanged');
  });

  it('adds the field to an exercise that has none, costing exactly one line', () => {
    const victim = scales().exercises.find((e: any) => !Object.hasOwn(e, 'description'));
    expect(victim, 'fixture needs an exercise with no description').toBeTruthy();
    const lines = read().split('\n').length;
    const { code, out } = run([
      '--instrument=guitar', '--category=scales',
      `--title=${victim.title}`, `--description=${NEW}`,
    ]);
    expect(code).toBe(0);
    expect(out).toContain('description added');
    expect(find(victim.title).description).toBe(NEW);
    expect(read().split('\n').length).toBe(lines + 1);
  });

  it('clears the field, giving exactly one line back', () => {
    const lines = read().split('\n').length;
    const { code, out } = run([...BASE, '--clear']);
    expect(code).toBe(0);
    expect(out).toContain('description cleared');
    expect(Object.hasOwn(find(TITLE), 'description')).toBe(false);
    expect(read().split('\n').length).toBe(lines - 1);
  });

  it('--dry-run writes nothing', () => {
    const original = read();
    const { code, out } = run([...BASE, `--description=${NEW}`, '--dry-run']);
    expect(code).toBe(0);
    expect(out).toContain('DRY RUN');
    expect(read()).toBe(original);
  });

  describe('guards', () => {
    it('rejects a missing --description', () => {
      const { code, out } = run([...BASE]);
      expect(code).toBe(2);
      expect(out).toContain('missing --description');
    });

    it('rejects an empty --description in favour of --clear', () => {
      const { code, out } = run([...BASE, '--description=']);
      expect(code).toBe(2);
      expect(out).toContain('use --clear');
    });

    it('rejects --clear together with --description', () => {
      const { code, out } = run([...BASE, `--description=${NEW}`, '--clear']);
      expect(code).toBe(2);
      expect(out).toContain('mutually exclusive');
    });

    it('rejects --clear on an exercise with no description', () => {
      const victim = scales().exercises.find((e: any) => !Object.hasOwn(e, 'description'));
      const { code, out } = run([
        '--instrument=guitar', '--category=scales', `--title=${victim.title}`, '--clear',
      ]);
      expect(code).toBe(3);
      expect(out).toContain('no description to clear');
    });

    it('rejects an unknown title', () => {
      const { code, out } = run([
        '--instrument=guitar', '--category=scales',
        '--title=Nope', `--description=${NEW}`,
      ]);
      expect(code).toBe(3);
      expect(out).toContain('no exercise titled');
    });

    it('rejects an unknown category', () => {
      const { code, out } = run([
        '--instrument=guitar', '--category=nope',
        `--title=${TITLE}`, `--description=${NEW}`,
      ]);
      expect(code).toBe(5);
      expect(out).toContain('no category');
    });

    it('rejects an unknown instrument', () => {
      const { code, out } = run([
        '--instrument=kazoo', '--category=scales',
        `--title=${TITLE}`, `--description=${NEW}`,
      ]);
      expect(code).toBe(2);
      expect(out).toContain('unknown instrument');
    });

    it('rejects an unknown option', () => {
      const { code, out } = run([...BASE, `--description=${NEW}`, '--weight=3']);
      expect(code).toBe(2);
      expect(out).toContain('unknown option --weight');
    });

    it('matches the title case- and whitespace-insensitively', () => {
      const { code } = run([
        '--instrument=guitar', '--category=scales',
        `--title=  ${TITLE.toUpperCase()}  `, `--description=${NEW}`,
      ]);
      expect(code).toBe(0);
      expect(find(TITLE).description).toBe(NEW);
    });
  });
});
