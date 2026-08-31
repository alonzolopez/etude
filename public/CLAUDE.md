# Content files

`exercises/index.json` lists instruments: `{id, name, file, hotkey}`.
Each instrument file: `{"instrument": name, "categories": [{key, name, exercises}]}`.
Category order = wizard display order; category keys unique per file.

Exercise fields: `title`* , `weight`* (≥0; 0 = disabled, never drawn), `url`,
`file`, `key[]`, `mode[]`,
`metronome_range [lo, hi]`, `description`. Type by field: `file` → alphaTab
notation, path under `notation/` (GPX preferred for Soundslice exports; MusicXML
and alphaTex also supported — alphaTex is the format for newly authored
exercises); soundslice.com `url` → card +
external link; youtube `url` → embed; any other `url` → plain iframe; neither →
text. Never re-add: `images`, `example`, `backing_track`, `starting_string`,
`original_key`.

`npm run test` validates these files (`tests/content.test.ts`) — run it after edits.
