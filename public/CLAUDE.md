# Content files

`exercises/index.json` lists instruments: `{id, name, file, hotkey}`.
Each instrument file: `{"instrument": name, "categories": [{key, name, exercises}]}`.
Category order = wizard display order; category keys unique per file.

In the guitar `scales` category, weight 0 also means "notation not authored yet":
the owner keeps the exercise listed as a visible TODO, and the category serves
alphaTex only. So an entry there whose `file` is absent or is a `.gpx` carries
weight 0 — set it with `set-weight.mjs`, and raise it once its `.alphatex` exists.

Exercise fields: `title`* , `weight`* (≥0; 0 = disabled, never drawn), `url`,
`file`, `key[]`, `position[]`,
`metronome_range [lo, hi]`, `description`. Type by field: `file` → alphaTab
notation, path under `notation/<instrument>/` (GPX preferred for Soundslice exports;
MusicXML and alphaTex also supported — alphaTex is the format for newly authored
exercises); soundslice.com `url` → card +
external link; youtube `url` → embed; any other `url` → plain iframe; neither →
text. Never re-add: `images`, `example`, `backing_track`, `starting_string`,
`original_key`, `mode`.

`file` may contain `{root}` and `{position}`, expanded per draw from the rolled `key`
and `position` — `notation/guitar/scales/dorian/{root}/p{position}.alphatex` with
`key: ["A# dorian", …]` and `position: [1..5]` resolves to
`notation/guitar/scales/dorian/a-sharp/p3.alphatex`. `#` is spelled `-sharp` because
`fetch` reads `#` as a URL fragment; paths are lowercase because GitHub Pages is
case-sensitive. For the axes the `file` template references, `key[]` and `position[]`
are the coverage declaration: `tests/content.test.ts` expands every combination and
reports every missing file, so list such a value only once its file exists. An axis the
template does not name multiplies nothing — a literal `file` with twelve keys is one
movable shape drawn under twelve transposition prompts, not twelve files.

Write these files with `.claude/skills/_notation/scripts/add-exercise.mjs`, not by
hand and never with a whole-file dump: they are 2-space-indented with **no trailing
newline**, and a reformat turns a 5-line content change into a 1000-line diff.

`npm run test` validates these files (`tests/content.test.ts`) — run it after edits.
