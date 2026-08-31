import { describe, it, expect } from 'vitest';
import { InstanceHistory } from '../src/history';
import type { ExerciseInstance } from '../src/exercises';

const inst = (title: string, bpm?: number): ExerciseInstance => ({
  category: { key: 'c', name: 'C' },
  exercise: { title, weight: 1 },
  ...(bpm !== undefined ? { bpm } : {}),
});

describe('InstanceHistory', () => {
  it('push advances; goTo walks back and forward to exact instances', () => {
    const h = new InstanceHistory();
    h.push(inst('a', 90));
    h.push(inst('b', 100));
    expect(h.index).toBe(1);
    expect(h.goTo(0)?.exercise.title).toBe('a');
    expect(h.goTo(0)?.bpm).toBe(90);
    expect(h.canGoForward).toBe(true);
    expect(h.goTo(1)?.exercise.title).toBe('b');
  });

  it('pushing after going back truncates the forward stack', () => {
    const h = new InstanceHistory();
    h.push(inst('a'));
    h.push(inst('b'));
    h.goTo(0);
    h.push(inst('c'));
    expect(h.length).toBe(2);
    expect(h.current?.exercise.title).toBe('c');
    expect(h.canGoForward).toBe(false);
  });

  it('bpm tweaks are written into the current instance', () => {
    const h = new InstanceHistory();
    h.push(inst('a', 90));
    h.push(inst('b', 100));
    h.goTo(0);
    h.updateCurrentBpm(97);
    h.goTo(1);
    expect(h.goTo(0)?.bpm).toBe(97);
  });

  it('goTo clamps out-of-range indices', () => {
    const h = new InstanceHistory();
    h.push(inst('a'));
    expect(h.goTo(5)?.exercise.title).toBe('a');
    expect(h.goTo(-3)?.exercise.title).toBe('a');
    expect(new InstanceHistory().goTo(0)).toBeNull();
  });
});
