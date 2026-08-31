/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  base: '/etude/',
  test: {
    environment: 'jsdom',
  },
});
