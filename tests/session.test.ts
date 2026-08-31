import { describe, it, expect } from 'vitest';
import { SessionTimer } from '../src/session';

describe('SessionTimer', () => {
  it('derives remaining from wall clock, not tick counts', () => {
    let t = 1000;
    const timer = new SessionTimer(5, () => t);
    timer.start();
    t += 2 * 60_000; // jump 2 minutes at once (throttled-tab simulation)
    expect(timer.remainingMs).toBe(3 * 60_000);
    expect(timer.formatted()).toBe('03:00');
  });

  it('goes overtime and counts up', () => {
    let t = 0;
    const timer = new SessionTimer(1, () => t);
    timer.start();
    t += 90_000;
    expect(timer.isOvertime).toBe(true);
    expect(timer.formatted()).toBe('00:30');
  });

  it('crossedZero fires exactly once', () => {
    let t = 0;
    const timer = new SessionTimer(1, () => t);
    timer.start();
    expect(timer.crossedZero()).toBe(false);
    t += 61_000;
    expect(timer.crossedZero()).toBe(true);
    expect(timer.crossedZero()).toBe(false);
  });
});
