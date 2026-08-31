import { describe, it, expect, vi } from 'vitest';
import { appendParams, noopPlayer, createYouTubePlayer } from '../src/players';

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

describe('createYouTubePlayer', () => {
  const ORIGIN = 'https://www.youtube-nocookie.com';

  function makeIframe(): HTMLIFrameElement {
    const iframe = document.createElement('iframe');
    iframe.src = `${ORIGIN}/embed/x?si=abc`;
    document.body.appendChild(iframe);
    return iframe;
  }

  it('play() posts a playVideo command to the iframe origin', () => {
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, 'postMessage');
    const player = createYouTubePlayer(iframe);

    player.play();

    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
      ORIGIN,
    );
  });

  it('pause() posts a pauseVideo command to the iframe origin', () => {
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, 'postMessage');
    const player = createYouTubePlayer(iframe);

    player.pause();

    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
      ORIGIN,
    );
  });

  it('setVolume clamps above 100 down to 100', () => {
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, 'postMessage');
    const player = createYouTubePlayer(iframe);

    player.setVolume(150);

    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'setVolume', args: [100] }),
      ORIGIN,
    );
  });

  it('setVolume clamps below 0 up to 0', () => {
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, 'postMessage');
    const player = createYouTubePlayer(iframe);

    player.setVolume(-5);

    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'command', func: 'setVolume', args: [0] }),
      ORIGIN,
    );
  });

  it('posts the listening handshake when the iframe fires load', () => {
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, 'postMessage');
    createYouTubePlayer(iframe);

    iframe.dispatchEvent(new Event('load'));

    expect(postMessage).toHaveBeenCalledWith(
      JSON.stringify({ event: 'listening', id: 'etude' }),
      ORIGIN,
    );
  });

  it('toggle() alternates between play and pause payloads', () => {
    const iframe = makeIframe();
    const postMessage = vi.spyOn(iframe.contentWindow!, 'postMessage');
    const player = createYouTubePlayer(iframe);

    player.toggle();
    expect(postMessage).toHaveBeenLastCalledWith(
      JSON.stringify({ event: 'command', func: 'playVideo', args: [] }),
      ORIGIN,
    );

    player.toggle();
    expect(postMessage).toHaveBeenLastCalledWith(
      JSON.stringify({ event: 'command', func: 'pauseVideo', args: [] }),
      ORIGIN,
    );
  });
});
