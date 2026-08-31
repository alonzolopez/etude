# etude

Timed practice-session web app (guitar/bass/drums), deployed to
https://www.alonzolopez.com/etude/ (also reachable via https://alonzolopez.github.io/etude/, which redirects) by `.github/workflows/deploy.yml` on every
push to master. Design spec: `docs/spec.md` — read it before changing behavior.

## Commands
- `npm run dev` — dev server
- `npm run test` — Vitest (jsdom)
- `npm run build` — typecheck + production build

## Content editing
Exercises live in `public/exercises/` (see `public/CLAUDE.md` for the schema).
Edit → commit → push → live in ~1 min. No app code changes needed.
Converting a Soundslice exercise to inline notation: export GPX from Soundslice,
commit under `public/notation/`, set the exercise's `file`, drop its `url`.

## Hotkeys
Wizard: `g/b/d` instrument · `1–9` category · `1–5` duration presets ·
`enter` start · `esc`/`←` back.
Practice: `→` next · `←` previous · `space` player-or-metronome · `m` metronome ·
`↑/↓` volume · `shift+↑/↓` bpm · `h` home.

## Modules (src/)
- `exercises.ts` — content types, classification, weighted draw, materialization
- `history.ts` — instance stack (back restores exact key/mode/bpm)
- `session.ts` — wall-clock timer + overtime
- `metronome.ts` — Web Audio lookahead scheduler; never setTimeout-driven clicks
- `hotkeys.ts` — key layer; single keys suspended while an input has focus
- `players.ts` / `notation.ts` — player contract; YouTube + alphaTab adapters
- `theme.ts`, `storage.ts`, `screens/wizard.ts`, `screens/practice.ts`

## Rules
- All colors live in `src/styles/tokens.css`, defined for both themes.
- History API entries never change the URL path (GitHub Pages 404s otherwise).
- localStorage only through `src/storage.ts` (keys: `etude.duration`, `etude.volume`, `etude.bpm`, `etude.theme`).
