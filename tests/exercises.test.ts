import { describe, it, expect } from 'vitest';
import { classify, weightedDraw, materialize, type Exercise, type Category } from '../src/exercises';

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
  const full = ex({ key: ['A', 'B'], mode: [1, 5], metronome_range: [60, 62] });
  it('rolls key, mode, and integer bpm within inclusive bounds', () => {
    const inst = materialize(full, cat, () => 0.999);
    expect(inst.key).toBe('B');
    expect(inst.mode).toBe(5);
    expect(inst.bpm).toBe(62);
    expect(inst.category).toEqual({ key: 'scales', name: 'Scales' });
  });
  it('omits fields the exercise lacks', () => {
    const inst = materialize(ex({}), cat, () => 0.5);
    expect(inst.key).toBeUndefined();
    expect(inst.mode).toBeUndefined();
    expect(inst.bpm).toBeUndefined();
  });
});
