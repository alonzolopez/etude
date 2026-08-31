# etude

Timed practice-session web app (guitar/bass/drums). Design spec: `docs/spec.md` — read it before changing behavior.

## Commands
- `npm run dev` — dev server
- `npm run test` — Vitest
- `npm run build` — typecheck + production build

## Rules
- All colors live in `src/styles/tokens.css`, defined for both themes.
- History API entries never change the URL path (GitHub Pages).
- localStorage only through `src/storage.ts`.
