import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import { cpSync, mkdtempSync, readFileSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

// add-exercise.mjs edits public/exercises/*.json, the content files the whole app
// reads. The thing that must never regress is byte-level: these files are
// 2-space-indented with NO trailing newline, and an insertion must leave every
// other byte alone. A whole-file reformat turns a 5-line content change into a
// 1000-line diff and buries what actually changed.

const SCRIPT = join(process.cwd(), '.claude/skills/_notation/scripts/add-exercise.mjs');

let root: string;
const target = () => join(root, 'public/exercises/guitar.json');
const read = () => readFileSync(target(), 'utf8');

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

const ADD = [
  '--instrument=guitar',
  '--category=scales',
  '--title=C major scale (8th position)',
  '--weight=2',
  '--file=notation/c-major-8th-position.alphatex',
];

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'etude-add-'));
  mkdirSync(join(root, 'public'), { recursive: true });
  cpSync(join(process.cwd(), 'public/exercises'), join(root, 'public/exercises'), { recursive: true });
  mkdirSync(join(root, 'public/notation'), { recursive: true });
  // The script refuses a --file that does not exist, so the fixture must contain
  // the notation files the cases below reference.
  for (const n of ['c-major-8th-position', 'x', 'dorian-1'])
    writeFileSync(join(root, `public/notation/${n}.alphatex`), '\\title "fixture"\n.\n:4 0.6\n');
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('add-exercise.mjs', () => {
  it('leaves every untouched byte alone — removing the inserted lines restores the original exactly', () => {
    const before = read();
    expect(run(ADD).code).toBe(0);
    const after = read();

    const b = before.split('\n');
    const a = after.split('\n');
    expect(a.length).toBeGreaterThan(b.length);

    // Find the inserted run: common prefix, common suffix, everything between is new.
    let head = 0;
    while (head < b.length && b[head] === a[head]) head++;
    let tail = 0;
    while (tail < b.length - head && b[b.length - 1 - tail] === a[a.length - 1 - tail]) tail++;

    const restored = [...a.slice(0, head), ...a.slice(a.length - tail)].join('\n');
    expect(restored).toBe(before);
  });

  it('preserves 2-space indent and no trailing newline', () => {
    expect(run(ADD).code).toBe(0);
    const after = read();
    expect(after.endsWith('}')).toBe(true);
    expect(after.endsWith('\n')).toBe(false);
    expect(after).toContain('\n  "instrument"');
  });

  it('writes fields in canonical order: title, weight, file, key, mode, metronome_range, description', () => {
    const code = run([
      ...ADD,
      '--metronome=60,130',
      '--description=Two octaves, ascending then descending',
      '--key=C major,D major',
      '--mode=1,2',
    ]).code;
    expect(code).toBe(0);

    const cat = JSON.parse(read()).categories.find((c: any) => c.key === 'scales');
    const ex = cat.exercises.find((e: any) => e.title === 'C major scale (8th position)');
    expect(Object.keys(ex)).toEqual([
      'title', 'weight', 'file', 'key', 'mode', 'metronome_range', 'description',
    ]);
    expect(ex.metronome_range).toEqual([60, 130]);
    expect(ex.key).toEqual(['C major', 'D major']);
    expect(ex.mode).toEqual([1, 2]);
  });

  it('appends to the end of the category, leaving existing exercises in order', () => {
    const before = JSON.parse(read()).categories.find((c: any) => c.key === 'scales').exercises;
    expect(run(ADD).code).toBe(0);
    const after = JSON.parse(read()).categories.find((c: any) => c.key === 'scales').exercises;

    expect(after).toHaveLength(before.length + 1);
    expect(after.slice(0, -1)).toEqual(before);
    expect(after.at(-1).title).toBe('C major scale (8th position)');
  });

  it('refuses a duplicate title in the same category and writes nothing', () => {
    const before = read();
    const r = run([
      '--instrument=guitar',
      '--category=scales',
      '--title=The Altered Scale',
      '--weight=1',
      '--file=notation/x.alphatex',
    ]);
    expect(r.code).toBe(4);
    expect(r.out).toMatch(/already/i);
    expect(read()).toBe(before);
  });

  it('refuses an unknown category unless --create-category is given', () => {
    const before = read();
    const r = run([...ADD.slice(0, 1), '--category=nope', ...ADD.slice(2)]);
    expect(r.code).toBe(5);
    expect(read()).toBe(before);
  });

  it('--create-category appends {key, name, exercises} with the exercise inside', () => {
    const r = run([
      '--instrument=guitar',
      '--category=modal_shapes',
      '--create-category=Modal Shapes',
      '--title=Dorian shape 1',
      '--weight=1',
      '--file=notation/dorian-1.alphatex',
    ]);
    expect(r.code).toBe(0);

    const cats = JSON.parse(read()).categories;
    const created = cats.at(-1);
    expect(Object.keys(created)).toEqual(['key', 'name', 'exercises']);
    expect(created.key).toBe('modal_shapes');
    expect(created.name).toBe('Modal Shapes');
    expect(created.exercises).toHaveLength(1);
  });

  it('rejects a dead field outright', () => {
    const before = read();
    const r = run([...ADD, '--original_key=C']);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/original_key/);
    expect(read()).toBe(before);
  });

  it('rejects a negative weight', () => {
    const before = read();
    const r = run([...ADD.slice(0, 3), '--weight=-1', ...ADD.slice(4)]);
    expect(r.code).not.toBe(0);
    expect(read()).toBe(before);
  });

  it('rejects a notation file that does not exist under public/', () => {
    const before = read();
    const r = run([...ADD.slice(0, 4), '--file=notation/missing.alphatex']);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/missing\.alphatex/);
    expect(read()).toBe(before);
  });

  it('refuses to add notation into a jam-track category without --force', () => {
    // Jam-track categories hold slices synced to real recordings; alphaTab
    // synthesis loses that sync, so they stay Soundslice cards (spec 2.2). Both
    // skills state this in prose — enforcing it here makes it unskippable.
    const before = read();
    const r = run([
      '--instrument=guitar',
      '--category=jam_tracks',
      '--title=Something new',
      '--weight=1',
      '--file=notation/x.alphatex',
    ]);
    expect(r.code).not.toBe(0);
    expect(r.out).toMatch(/jam/i);
    expect(read()).toBe(before);
  });

  it('--force allows the jam-track case the owner explicitly approved', () => {
    const r = run([
      '--instrument=guitar',
      '--category=jam_tracks',
      '--title=Something new',
      '--weight=1',
      '--file=notation/x.alphatex',
      '--force',
    ]);
    expect(r.code).toBe(0);
  });

  it('allows a url exercise into a jam-track category', () => {
    // A Soundslice card is exactly what belongs there.
    const r = run([
      '--instrument=guitar',
      '--category=jam_tracks',
      '--title=Some jam',
      '--weight=1',
      '--url=https://www.soundslice.com/slices/abcde/',
    ]);
    expect(r.code).toBe(0);
  });

  it('--dry-run prints the exercise and writes nothing', () => {
    const before = read();
    const r = run([...ADD, '--dry-run']);
    expect(r.code).toBe(0);
    expect(r.out).toContain('C major scale (8th position)');
    expect(read()).toBe(before);
  });
});
