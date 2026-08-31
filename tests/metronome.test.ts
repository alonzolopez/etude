import { describe, it, expect } from 'vitest';
import { BeatScheduler } from '../src/metronome';

describe('BeatScheduler', () => {
  it('schedules drift-free beats at exact multiples of the interval', () => {
    const ctx = { currentTime: 0 };
    const times: number[] = [];
    const s = new BeatScheduler(ctx, (t) => times.push(t));
    s.bpm = 120; // 0.5s interval
    s.horizon = 0.6;
    s.start();
    s.tick();               // schedules 0.05 and 0.55
    ctx.currentTime = 0.5;
    s.tick();               // schedules 1.05
    expect(times).toEqual([0.05, 0.55, 1.05]);
  });

  it('a bpm change takes effect from the next beat', () => {
    const ctx = { currentTime: 0 };
    const times: number[] = [];
    const s = new BeatScheduler(ctx, (t) => times.push(t));
    s.bpm = 60;
    s.horizon = 0.1;
    s.start();
    s.tick();               // 0.05
    s.bpm = 120;
    ctx.currentTime = 1.0;
    s.tick();               // next at 0.05 + 0.5 = 0.55, then 1.05
    expect(times).toEqual([0.05, 0.55, 1.05]);
  });

  it('stop() halts scheduling; start() re-anchors to now', () => {
    const ctx = { currentTime: 0 };
    const times: number[] = [];
    const s = new BeatScheduler(ctx, (t) => times.push(t));
    s.bpm = 60; s.horizon = 0.1;
    s.start(); s.tick(); s.stop();
    ctx.currentTime = 10;
    s.tick();
    expect(times).toEqual([0.05]);
    s.start(); s.tick();
    expect(times).toEqual([0.05, 10.05]);
  });
});
