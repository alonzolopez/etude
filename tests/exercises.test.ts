import { describe, it, expect } from 'vitest';
import { classify, weightedDraw, materialize, rootSlug, resolveFile, type Exercise, type Category } from '../src/exercises';

const ex = (over: Partial<Exercise>): Exercise => ({ title: 't', weight: 1, ...over });

describe('classify', () => {
  it('file beats url', () =>
    expect(classify(ex({ file: 'notation/a.gp', url: 'https://x.com' }))).toBe('notation'));
  it('soundslice by host', () =>
    expect(classify(ex({ url: 'https://www.soundslice.com/slices/xFhXc/' }))).toBe('soundslice'));
  it('youtube incl. nocookie', () => {
    expect(classify(ex({ url: 'https://www.youtube.com/embed/a' }))).toBe('youtube');
    expect(classify(ex({ url: 'https://www.youtube-nocookie.com/embed/a?si=x' }))).toBe('youtube');
  });
  it('unknown hosts are generic iframes', () =>
    expect(classify(ex({ url: 'https://www.mikeslessons.com/groove/?x=1' }))).toBe('iframe'));
  it('nothing means text', () => expect(classify(ex({}))).toBe('text'));
});

describe('weightedDraw', () => {
  const list = [ex({ title: 'a', weight: 1 }), ex({ title: 'b', weight: 3 })];
  it('respects weights via injected rand', () => {
    expect(weightedDraw(list, () => 0.0).title).toBe('a');
    expect(weightedDraw(list, () => 0.9).title).toBe('b');
  });
  it('single-item list always wins', () =>
    expect(weightedDraw([list[0]!], () => 0.99).title).toBe('a'));
});

describe('materialize', () => {
  const cat: Category = { key: 'scales', name: 'Scales', exercises: [] };
  const full = ex({ key: ['A', 'B'], position: [1, 5], metronome_range: [60, 62] });
  it('rolls key, position, and integer bpm within inclusive bounds', () => {
    const inst = materialize(full, cat, () => 0.999);
    expect(inst.key).toBe('B');
    expect(inst.position).toBe(5);
    expect(inst.bpm).toBe(62);
    expect(inst.category).toEqual({ key: 'scales', name: 'Scales' });
  });
  it('omits fields the exercise lacks', () => {
    const inst = materialize(ex({}), cat, () => 0.5);
    expect(inst.key).toBeUndefined();
    expect(inst.position).toBeUndefined();
    expect(inst.bpm).toBeUndefined();
    expect(inst.file).toBeUndefined();
  });
  it('resolves the file template against the rolled key and position', () => {
    const inst = materialize(
      ex({
        file: 'notation/guitar/scales/dorian/{root}/p{position}.alphatex',
        key: ['A dorian', 'A# dorian'],
        position: [1, 3],
      }),
      cat,
      () => 0.999,
    );
    expect(inst.file).toBe('notation/guitar/scales/dorian/a-sharp/p3.alphatex');
  });
  it('carries a literal file through untouched', () => {
    const inst = materialize(ex({ file: 'notation/guitar/minor-pentatonic.gpx' }), cat, () => 0.5);
    expect(inst.file).toBe('notation/guitar/minor-pentatonic.gpx');
  });
});

describe('rootSlug', () => {
  it('spells accidentals out so # never reaches a fetched path', () => {
    expect(rootSlug('A# dorian')).toBe('a-sharp');
    expect(rootSlug('Bb major blues')).toBe('b-flat');
  });
  it('lowercases naturals', () => {
    expect(rootSlug('C')).toBe('c');
    expect(rootSlug('B major blues')).toBe('b');
  });
  it('reads only the leading note token, ignoring the quality', () => {
    expect(rootSlug('A# ionian #5')).toBe('a-sharp');
    expect(rootSlug('G altered bb7')).toBe('g');
  });
  it('throws on an unparseable key', () => {
    expect(() => rootSlug('H minor')).toThrow(/unparseable key/);
  });
});

describe('resolveFile', () => {
  const tpl = 'notation/guitar/scales/dorian/{root}/p{position}.alphatex';
  it('expands root and position', () => {
    expect(resolveFile(tpl, 'A# dorian', 3))
      .toBe('notation/guitar/scales/dorian/a-sharp/p3.alphatex');
  });
  it('returns a literal path untouched', () => {
    expect(resolveFile('notation/guitar/minor-pentatonic.gpx'))
      .toBe('notation/guitar/minor-pentatonic.gpx');
  });
  it('throws when a placeholder has no rolled value', () => {
    expect(() => resolveFile(tpl, 'A# dorian')).toThrow(/needs a rolled position/);
    expect(() => resolveFile(tpl, undefined, 3)).toThrow(/needs a rolled key/);
  });
  it('throws on an unknown placeholder, so a stale {mode} fails loudly', () => {
    expect(() => resolveFile('x/{mode}.alphatex', 'A minor', 1))
      .toThrow(/unknown placeholder \{mode\}/);
  });
});
