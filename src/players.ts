export interface Player {
  readonly controllable: boolean;
  play(): void;
  pause(): void;
  toggle(): void;
  setVolume(v: number): void;
  destroy(): void;
}

export const noopPlayer: Player = {
  controllable: false,
  play() {}, pause() {}, toggle() {}, setVolume() {}, destroy() {},
};

export function appendParams(url: string, params: Record<string, string>): string {
  const u = new URL(url);
  for (const [k, v] of Object.entries(params)) u.searchParams.set(k, v);
  return u.toString();
}

/**
 * Drives a YouTube embed loaded with enablejsapi=1 via postMessage commands.
 * Player state is not readable cross-origin; we track intent locally.
 */
export function createYouTubePlayer(iframe: HTMLIFrameElement): Player {
  const origin = new URL(iframe.src).origin;
  const send = (func: string, args: unknown[] = []) =>
    iframe.contentWindow?.postMessage(
      JSON.stringify({ event: 'command', func, args }),
      origin,
    );
  let playing = false;
  // The session volume is applied at mount, before the widget has booted, and
  // commands sent that early are dropped — so remember it and replay it with the
  // handshake (spec §4.1: one session volume drives the current player).
  let volume: number | null = null;

  // handshake so the widget accepts commands
  iframe.addEventListener('load', () => {
    iframe.contentWindow?.postMessage(JSON.stringify({ event: 'listening', id: 'etude' }), origin);
    if (volume !== null) send('setVolume', [volume]);
  });

  return {
    controllable: true,
    play() { send('playVideo'); playing = true; },
    pause() { send('pauseVideo'); playing = false; },
    toggle() { playing ? this.pause() : this.play(); },
    setVolume(v: number) {
      volume = Math.max(0, Math.min(100, v));
      send('setVolume', [volume]);
    },
    destroy() {},
  };
}
