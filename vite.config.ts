/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import { viteStaticCopy } from 'vite-plugin-static-copy';

export default defineConfig({
  base: '/etude/',
  plugins: [
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
