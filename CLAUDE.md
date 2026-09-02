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
Use a skill rather than hand-editing — both parse-validate with alphaTab before
touching any JSON, and both refuse song-synced jam-track slices, which stay
Soundslice cards permanently (spec §2.2):
- **`create-alphatex`** — writing notation from a description (a scale, lick,
  groove, positional variant). Settles the music with you first, then authors
  alphaTex against a verified syntax reference.
- **`convert-soundslice`** — an export or notation file already exists.

Shared tooling in `.claude/skills/_notation/scripts/`: `find-exercise`,
`validate-notation` (parses), `describe-score` (reads the notes back out as
pitches), `add-exercise`, `set-weight` and `remove-exercise` (the only three things
that should write `public/exercises/*.json` — they are 2-space with no trailing
newline; `add-exercise` appends, `set-weight` changes one draw weight in place,
`remove-exercise` deletes an entry and refuses one carrying notation without
`--force`), `generate-scale-family` (the only
thing that should write `public/notation/guitar/scales/*` — regenerates one
positional family from its shape table in `.claude/skills/_notation/shapes/`;
`tests/scale-corpus.test.ts` proves the two never drift).

## Previewing notation
`preview.html` renders notation files through the production path
(`src/notation.ts`) without playing a practice session. Dev-only — Vite's build
input is `index.html`, so it never reaches `dist/`.
```
npm run dev
# one or more files, paths written exactly as an exercise's `file` field:
http://localhost:5173/etude/preview.html?files=notation/guitar/a.alphatex,notation/guitar/b.alphatex
# no ?files= lists every notation exercise in the content files
```

## Hotkeys
Wizard: `g/b/d` instrument · `1–9` category · `1–5` duration presets ·
`enter` start · `esc`/`←` back.
Practice: `→` next · `←` previous · `space` player-or-metronome · `m` metronome ·
`↑/↓` volume · `shift+↑/↓` bpm · `h` home.

## Modules (src/)
- `exercises.ts` — content types, classification, weighted draw, materialization
- `history.ts` — instance stack (back restores exact key/position/bpm)
- `session.ts` — wall-clock timer + overtime
- `metronome.ts` — Web Audio lookahead scheduler; never setTimeout-driven clicks
- `hotkeys.ts` — key layer; single keys suspended while an input has focus
- `players.ts` / `notation.ts` — player contract; YouTube + alphaTab adapters
- `theme.ts`, `storage.ts`, `screens/wizard.ts`, `screens/practice.ts`

## Rules
- All colors live in `src/styles/tokens.css`, defined for both themes.
- History API entries never change the URL path (GitHub Pages 404s otherwise).
- localStorage only through `src/storage.ts` (keys: `etude.duration`, `etude.volume`, `etude.bpm`, `etude.theme`).
