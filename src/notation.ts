import * as alphaTab from '@coderline/alphatab';
import type { Player } from './players';

export interface NotationHandle { player: Player; destroy(): void; }

function cssToken(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim();
}

export function mountNotation(container: HTMLElement, filePath: string): NotationHandle {
  const base = import.meta.env.BASE_URL;
  // alphaTex is text and loads via api.tex(); binary formats load via core.file
  const isTex = /\.(alphatex|atex|tex)$/i.test(filePath);
  const settings = {
    core: {
      ...(isTex ? {} : { file: `${base}${filePath}` }),
      fontDirectory: `${base}alphatab/font/`,
    },
    player: {
      enablePlayer: true,
      soundFont: `${base}alphatab/soundfont/sonivox.sf2`,
      scrollElement: container,
    },
    display: {
      resources: {
        // theme the notation from the same tokens as the page (spec §7.3)
        mainGlyphColor: cssToken('--ink'),
        secondaryGlyphColor: cssToken('--muted'),
        staffLineColor: cssToken('--line'),
        barSeparatorColor: cssToken('--line'),
        scoreInfoColor: cssToken('--ink'),
      },
    },
  };
  const api = new alphaTab.AlphaTabApi(container, settings);
  if (isTex) {
    void fetch(`${base}${filePath}`, { cache: 'no-cache' }) // unhashed under public/; see exercises.ts REVALIDATE
      .then((r) => { if (!r.ok) throw new Error(`${filePath}: HTTP ${r.status}`); return r.text(); })
      .then((tex) => api.tex(tex));
  }

  let playing = false;
  api.playerStateChanged.on((e) => { playing = e.state === alphaTab.synth.PlayerState.Playing; });

  // Task 11 calls both handle.player.destroy() and handle.destroy() on teardown;
  // alphaTab's api.destroy() is not itself idempotent, so guard it here.
  let destroyed = false;
  const destroyOnce = () => {
    if (destroyed) return;
    destroyed = true;
    api.destroy();
  };

  const player: Player = {
    controllable: true,
    play() { if (!playing) api.playPause(); },
    pause() { if (playing) api.playPause(); },
    toggle() { api.playPause(); },
    setVolume(v: number) { api.masterVolume = Math.max(0, Math.min(100, v)) / 100; },
    destroy: destroyOnce,
  };
  return { player, destroy: destroyOnce };
}
