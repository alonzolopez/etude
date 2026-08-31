---
name: convert-soundslice
description: Use when an etude exercise should stop being a Soundslice link-out card and render in-page instead — the owner supplies a Soundslice export (GPX preferred, MusicXML accepted) or newly-authored alphaTex, plus an exercise title or soundslice.com URL. Also use when a notation file arrives with no exercise to attach it to.
---

# Convert a Soundslice exercise to inline notation

## Overview

Converting is a **pure content edit**: commit the export under `public/notation/`,
give the exercise a `file`, drop its `url`. No app code changes, ever. `file` beats
`url` in `classify()` (`src/exercises.ts:24`), so the card becomes an alphaTab render
with synth playback.

**Core principle: the file proves it parses before the JSON learns it exists.** A
`file` pointing at something alphaTab can't read is a broken exercise in production
one push later.

## Hard stops — refuse, don't proceed

| Condition | Why | What to do |
|---|---|---|
| Exercise sits in a `*_jam_tracks` category | Song-synced slices lose their real-recording sync under alphaTab synthesis. Spec §2.2: these stay Soundslice cards **permanently** — the card is a finished surface, not a transitional one. | Refuse and say why. Convert only if the owner explicitly states this particular slice is not song-synced. |
| More than one exercise matches | Slice ids are reused across instruments — `gLTHc` is in `bass.json`, `drums.json` **and** `guitar.json`. | Show the matches, ask which. Never pick one. |
| No exercise matches | | Offer the **new exercise** path below. Don't invent a match. |
| alphaTab can't parse the export | | Stop. Leave the JSON untouched. Ask for a re-export. |

## Workflow

**1. Locate the exercise.** Exact title, url, or slice id:

```bash
node .claude/skills/convert-soundslice/scripts/find-exercise.mjs "<title|url|slice-id>" [--instrument=guitar|bass|drums]
```

Exit 0 = one match (proceed). Exit 4 = ambiguous. Exit 3 = none. The report flags
song-sync risk and prints the exercise JSON verbatim. Honor the hard stops above.

**2. Place the file.** `public/notation/<kebab-case-slug>.<ORIGINAL extension>`

- Slug from the **exercise title**: lowercase, non-alphanumerics → `-`, collapse
  repeats. If a sibling file already covers a related exercise, match its convention
  so the pair reads together (`minor-pentatonic.gpx` next to
  `minor-pentatonic-with-b5.gpx`).
- **Never rename the extension.** alphaTab sniffs binary content, so `.gpx`/`.gp`/
  `.musicxml` are interchangeable to the importer — but `src/notation.ts:13` routes
  by extension for text: alphaTex **must** end in `.alphatex`, `.atex`, or `.tex`, or
  the app will try to load it as a binary and render nothing.
- `cp` the export in; don't move it out of the owner's Downloads.

**3. Parse-validate headlessly — before touching JSON.**

```bash
node .claude/skills/convert-soundslice/scripts/validate-notation.mjs public/notation/<name>
```

Runs alphaTab's own importer (`ScoreLoader`), the same one the app uses at runtime,
and reports title/artist/tempo/tracks/bars/notes. Exit 1 on a parse failure *or* an
empty score. Report those numbers to the owner — a bar count that doesn't match the
slice means the wrong export.

**4. Edit the JSON — one line.** Replace the exercise's `"url"` line with its
`"file"` line, in place:

```diff
           "title": "Minor pentatonic scale",
           "weight": 2,
-          "url": "https://www.soundslice.com/slices/-scqc/",
+          "file": "notation/minor-pentatonic.gpx",
```

- The value is `notation/<name>` — **relative to `public/`**, no `public/` prefix
  (`tests/content.test.ts` checks `public/${ex.file}`).
- Keeping `file` in the url's slot preserves field order and keeps the diff to one
  line. Verify with `git diff --stat`: **one file, 1 insertion, 1 deletion.**
- Touch nothing else: `title`, `weight`, `key`, `mode`, `metronome_range`,
  `description` stay exactly as they are.
- Never re-add `images`, `example`, `backing_track`, `starting_string`,
  `original_key` — removed from the schema and never read.
- Never reformat the file. These are 2-space-indented with **no trailing newline**
  (`JSON.stringify(data, null, 2)` reproduces them byte-for-byte). A whole-file
  rewrite that adds a newline turns a 1-line diff into a 1000-line one.

**5. Verify.**

```bash
npx vitest run tests/content.test.ts
```

Schema, `weight >= 0`, file-existence, non-empty-category, dead-field checks — the
same gate CI runs. Must pass.

**6. Offer the visual check.** Say the exercise is wired and offer:
`npm run dev` → pick the instrument and its category → confirm the notation renders
and `space` plays it. This is the only step that proves the render, not just the
parse. Offer it; the owner decides.

**7. Commit and push.** `content: <what changed> (<exercise title>)`. Push is a live
deploy in ~1 min.

> **Ask before pushing if any of steps 3–6 were skipped or failed.** Otherwise
> pushing is what the owner asked for; do it.

## No matching exercise → add a new one

The sibling workflow (spec §12). Same steps 2–3 and 5–7, but instead of editing an
existing exercise, insert a new object into the right category's `exercises` array in
the right instrument file. Ask the owner for anything you don't have — never invent
content metadata.

```json
{
  "title": "<required>",
  "weight": 1,
  "file": "notation/<name>"
}
```

- `title` and `weight` are the only required fields. `weight` ≥ 0, relative within
  its category; **`0` means deliberately disabled** — never drawn, never delete-worthy.
- Optional: `key[]`, `mode[]`, `metronome_range [lo, hi]` (lo ≤ hi), `description`.
- Category keys are unique per instrument file, and array order is wizard display
  order. Creating a new category means `{key, name, exercises}` with at least one
  exercise — `tests/content.test.ts` fails on an empty category, because the wizard
  would offer it and then draw `undefined`.

## Red flags — stop and re-read the step

- About to edit JSON before `validate-notation.mjs` printed `OK`
- About to pick between two matches "because one is obviously right"
- About to convert something in `jam_tracks` / `bass_jam_tracks` / `drum_jam_tracks`
- `git diff --stat` shows more than 1 insertion + 1 deletion for a conversion
- About to push having skipped the test or the visual check without saying so

| Rationalization | Reality |
|---|---|
| "It parses in the browser, that's the real test" | The browser test is step 6, after the JSON is already pointing at the file. Parse first, cheaply. |
| "The slice id only matches one file, close enough" | It matched three for `gLTHc`. Run the script; read the count. |
| "This jam track isn't really song-synced" | That's the owner's call, not yours. Ask. |
| "Reformatting the JSON is cleaner" | It buries a 1-line content change in a whole-file diff. |
| "I'll re-add `original_key`, it's useful metadata" | Removed from the schema, never read, and the content test fails on it. |
