import { describe, it, expect } from 'vitest';
import { appendParams, noopPlayer } from '../src/players';

describe('appendParams', () => {
  it('appends to a bare url', () =>
    expect(appendParams('https://a.com/embed/x', { enablejsapi: '1' }))
      .toBe('https://a.com/embed/x?enablejsapi=1'));
  it('respects an existing query string', () =>
    expect(appendParams('https://a.com/embed/x?si=abc', { enablejsapi: '1' }))
      .toBe('https://a.com/embed/x?si=abc&enablejsapi=1'));
});

describe('noopPlayer', () => {
  it('is inert and not controllable', () => {
    expect(noopPlayer.controllable).toBe(false);
    expect(() => { noopPlayer.play(); noopPlayer.setVolume(50); noopPlayer.destroy(); }).not.toThrow();
  });
});
