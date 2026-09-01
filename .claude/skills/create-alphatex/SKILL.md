---
name: create-alphatex
description: Use when a new etude exercise's notation has to be written rather than imported — the owner describes a scale, lick, groove, warm-up, arpeggio, or positional variant in words and wants it rendering in-page. Also use when an existing exercise needs notation authored from scratch, or when breaking one exercise into several positional variants.
---

# Author a notation exercise in alphaTex

## Overview

Write alphaTex, prove it says what the owner asked for, let the owner look at it,
then wire it into `public/exercises/`. Pure content edit — no app code, ever.

**Core principle: the owner settles the music, the scripts settle the mechanics,
and the render is checked before the JSON is.** A file that parses is not a file
that is correct, and a file that is correct is not a file that draws.

If the owner already has a Soundslice export or an existing notation file, this is
the wrong skill — use `convert-soundslice`.

## Hard stops

| Condition | What to do |
|---|---|
| The description leaves the notes undetermined | **Ask.** See step 1. Do not draft on a guess. |
| Target category is `*_jam_tracks` | Refuse. Song-synced slices stay Soundslice cards permanently (spec §2.2). `add-exercise.mjs` also refuses; `--force` exists only for a slice the owner has explicitly said is not song-synced. |
| `validate-notation.mjs` or `describe-score.mjs` reports a failure | Stop. Fix the tex. Leave the JSON untouched. |
| An exercise with that title already exists | `add-exercise.mjs` refuses. Ask whether to replace or rename. |

## Workflow

### 1. Settle the music before writing anything

The description almost never determines the notes. Ask, one question at a time,
only for what is genuinely open and would change what gets written:

- **instrument and tuning** — guitar, bass (4- or 5-string), drums
- **key / starting pitch**
- **range and position** — how many octaves, which fret position, which string it starts on
- **shape** — ascending, descending, both, or sequenced (in 3rds, 4-note groups, …)
- **rhythm** — subdivision, and what happens at the turnaround
- **length** — how many bars
- **tempo**

Do not skip this because a default seems obvious. "8th position" alone does not
determine a C major scale: E, A, D and B all sit on fret 7, so the shape either
reaches back or shifts, and those are different exercises. Ask which.

Stop asking once the notes are determined. If the owner says "you pick", pick,
say what you picked in one line, and move on.

### 2. Locate the destination

```bash
node .claude/skills/_notation/scripts/find-exercise.mjs "<title>" [--instrument=guitar|bass|drums]
```

Exit 3 (no match) is the expected result for new work. A match means the exercise
already exists — ask before adding a second one.

Read the target category's existing exercises: `weight`, `metronome_range`, and
description tone are conventions to match, not values to invent.

### 3. Write the alphaTex

`public/notation/<instrument>/<family>/<root>/p<N>.alphatex` for positional variants,
or `public/notation/<instrument>/<kebab-case-slug>.alphatex` for a one-off. The
extension **must** be `.alphatex`, `.atex`, or `.tex`, or `src/notation.ts:13` loads it
as binary and renders nothing.

Roots are spelled `a`, `a-sharp`, `b-flat` — never `a#`, which `fetch` reads as a URL
fragment — and every path segment is lowercase, because GitHub Pages is case-sensitive
where macOS is not. The exercise's `file` names the family with placeholders:
`notation/guitar/scales/dorian/{root}/p{position}.alphatex`.

**Read `reference/alphatex.md` before writing.** It is verified against the
installed alphaTab 1.8.4 and lists six spellings that look correct and are parse
errors (`:4.`, a bare `-` tie, `\tuning drop-d`, `{text}`, `\ks Am`, named drum
articulations). Do not write alphaTex from memory.

For a batch, write every file before validating any — then validate each.

### 4. Prove it parses, then prove it is right

```bash
node .claude/skills/_notation/scripts/validate-notation.mjs public/notation/<instrument>/<name>.alphatex
node .claude/skills/_notation/scripts/describe-score.mjs  public/notation/<instrument>/<name>.alphatex --expect=C,D,E,F,G,A,B
```

`validate-notation` proves it parses. `describe-score` prints every bar back as
pitch names + `fret.string` + duration, catches off-the-neck frets and bars that
do not fill their time signature, and with `--expect` checks the pitch-class set.

**Read the dump against what the owner asked for.** The scripts cannot tell you
the scale is in the wrong octave or that the turnaround repeats a note; that is
what your eyes are for. Both gates must pass before step 6.

Do not write your own model-walking script. `describe-score.mjs` already handles
the trap that makes hand-rolled ones wrong: `note.string` in the parsed model
counts from the lowest string up, the inverse of alphaTex's `fret.string`.

### 5. Show the owner

```bash
npm run dev
```

Then give them the URL, listing every file from this batch — use the port Vite
actually prints, which is not 5173 when something else already holds it:

```
http://localhost:5173/etude/preview.html?files=notation/a.alphatex,notation/b.alphatex
```

`preview.html` renders through `src/notation.ts` — the production path — so this
is the only step that proves the staff actually draws. Paths are written exactly
as the `file` field will be.

**Wait for the owner's verdict.** If they approve, go to step 6 without looking
yourself. If they report a problem, then open the page and inspect it, fix, and
show them again.

### 6. Wire it up

```bash
node .claude/skills/_notation/scripts/add-exercise.mjs \
  --instrument=guitar --category=scales \
  --title="C major scale (8th position)" --weight=2 \
  --file=notation/c-major-8th-position.alphatex \
  --metronome=60,130 --description="..."
```

One call per exercise. It enforces field order, refuses dead fields and duplicate
titles, and preserves the files' exact bytes (2-space, no trailing newline) — never
hand-edit or reformat these files, and never write them with a whole-file dump.

A new category needs `--create-category="Display Name"`; category order is wizard
display order.

**`key[]` and `position[]` depend on whether the notation is movable.** A shape that
transposes — a pentatonic box, a movable arpeggio form — carries the category's full
`key[]`, and the drawn key is the transposition prompt. A family of per-position files
carries `position[]` and a `{root}`/`{position}` template. Notation fixed to one key and
position — a two-octave C major in 8th position — carries neither, because a drawn key
would contradict what is on screen.

**Only list a key or position whose file exists.** `tests/content.test.ts` expands every
combination of `key[] × position[]` through the template and fails on the first missing
file, so the arrays are the corpus's coverage declaration. Add values as files land.

**A pattern that runs the neck is a separate exercise, not a sixth position.** Up-the-neck,
one-string, and two-octave shapes get their own entry with no `{position}` placeholder and
no `position[]` — the file sits beside the position files
(`scales/minor-pentatonic/{root}/up-the-neck.alphatex`). A value inside `position[]` would
render as `pos 6`, which is a lie, and could not carry its own `metronome_range`, weight,
or description.

### 7. Verify and commit

```bash
npx vitest run tests/content.test.ts
```

Then commit: `content: add <title> (<instrument>/<category>)`. Push is a live
deploy in ~1 min — ask first if any step above was skipped or failed.

## Red flags — stop and re-read the step

- About to write alphaTex without opening `reference/alphatex.md`
- About to draft notation while a musical parameter is still undetermined
- About to write a throwaway script to decode pitches — that is `describe-score.mjs`
- About to edit exercise JSON before both scripts printed OK
- About to commit without the owner having seen the preview
- Editing `public/exercises/*.json` by hand or with a whole-file write
- `git diff --stat` touches anything under `src/`

## Rationalizations

| Excuse | Reality |
|---|---|
| "The defaults are obvious, I'll note my assumptions afterward" | Both baseline agents did exactly this and both had to append a list of guesses the owner then had to audit. Asking four questions first is cheaper than re-voicing the file. |
| "I'll write a quick script to check the pitches" | Both baseline agents wrote one. Both were unaudited one-offs, and a hand-rolled one gets `note.string` backwards. Run `describe-score.mjs`. |
| "It parses and the notes are right, the render is a formality" | The parse and the render are different failures. `preview.html` costs one command. |
| "I'll eyeball the preview myself and save the owner a step" | The owner asked to be the one who approves. Look only when they report a problem. |
| "I know alphaTex, the reference is for people who don't" | `:4.` for a dotted quarter is a parse error. So is a bare `-` tie. Six of them are listed. |
| "Reformatting the JSON is cleaner" | It buries a 5-line content change in a 1000-line diff. `add-exercise.mjs` exists for this. |
| "This jam track isn't really song-synced" | The owner's call, not yours. Ask. |

## Batch requests

"One file per position" is a normal request. Clarify all of them in step 1, write
all files, validate each, put every file in one preview URL, take one approval,
then one `add-exercise.mjs` call per exercise and a single commit.
