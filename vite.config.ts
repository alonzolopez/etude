/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';
import { alphaTab } from '@coderline/alphatab-vite';

export default defineConfig({
  base: '/etude/',
  plugins: [
    // Boots alphaTab's render worker / audio worklet correctly under Vite's dev-server
    // dep optimizer and production build (fixes render worker silently failing to load).
    // Asset copying is left to viteStaticCopy below since notation.ts already depends on
    // the alphatab/font + alphatab/soundfont URLs it produces, not this plugin's default
    // (unprefixed) /font + /soundfont output.
    ...alphaTab({ assetOutputDir: false }),
    viteStaticCopy({
      targets: [
        { src: 'node_modules/@coderline/alphatab/dist/font/*', dest: 'alphatab/font' },
        { src: 'node_modules/@coderline/alphatab/dist/soundfont/*', dest: 'alphatab/soundfont' },
      ],
    }),
  ],
  test: {
    environment: 'jsdom',
  },
});
