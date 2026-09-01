# alphaTex syntax — verified against alphaTab 1.8.4

Every construct on this page was round-tripped through the installed
`@coderline/alphatab` (the same importer the app uses) before being written down.
The **Traps** section exists because those five spellings are the ones that look
right and are not.

Re-verify anything you are unsure of instead of guessing:

```bash
printf '<your tex>' > /tmp/probe.alphatex
node .claude/skills/_notation/scripts/validate-notation.mjs /tmp/probe.alphatex
```

## Skeleton

```
\title "Two-Octave C Major"
\tempo 90
.
:8 8.6 10.6 7.5 8.5 | 10.5 7.4 9.4 10.4
```

Metadata first, then `.`, then the music. (1.8.4 emits a hint that the `.` is
optional — keep it; every file in `public/notation/` uses it and it reads clearly.)

## Notes

| Write | Means |
|---|---|
| `8.6` | fret 8 on string 6 |
| `0.3` | open string 3 |
| `(0.6 2.5 2.4)` | a chord — one beat, three notes |
| `r` | rest |
| `C4 D4 E4` | pitch by name, for a staff with no tuning |

**String 1 is the highest-pitched string.** On guitar, string 6 is the low E;
on 4-string bass, string 4 is the low E.

> Note: `note.string` in alphaTab's *parsed model* counts the other way (1 = lowest).
> `describe-score.mjs` converts it back, so its output is directly comparable to
> your source. Do not write your own model walker without accounting for this.

## Durations

`:1` whole · `:2` half · `:4` quarter · `:8` eighth · `:16` · `:32` · `:64`

A duration **persists until changed**, so `:8 5.6 8.6 5.5` is three eighths.

| Write | Means |
|---|---|
| `5.6{d}` | dotted |
| `5.6{dd}` | double dotted |
| `5.6{tu 3}` | triplet — mark **every** note of the group |
| `5.6*4` | repeat that beat 4 times |

## Bars and structure

| Write | Means |
|---|---|
| `\|` | bar line |
| `\ts 4 4` | time signature (top of file or mid-piece) |
| `\ks D` | key signature (a note name) |
| `\clef G2` | clef |
| `\ro` … `\rc 2` | repeat open / close, played 2x |
| `\ae 1` | alternate ending |
| `\section Intro` | section marker |
| `\tempo 140` | tempo change at that bar |

## Ties

```
:4 5.6 -.6 5.6 5.6
```

The tie is a note whose **fret is `-`**; it still needs its string.

## Effects

All verified working as `<note>{<effect>}`:

| Effect | Write |
|---|---|
| bend | `5.6{b (0 4)}` |
| slide (shift / legato) | `5.6{sl}` / `5.6{ss}` |
| hammer-on / pull-off | `5.6{h}` |
| palm mute | `5.6{pm}` |
| let ring | `5.6{lr}` |
| vibrato | `5.6{v}` |
| dead note | `5.6{x}` |
| ghost note | `5.6{g}` |
| staccato | `5.6{st}` |
| accent | `5.6{ac}` |
| natural harmonic | `12.6{nh}` |
| left-hand fingering | `5.6{lf 1}` |
| grace note | `5.6{gr}` |
| tremolo picking | `5.6{tp 8}` |
| dynamics | `5.6{dy f}` |
| beat text | `5.6{txt "hold"}` |

## Header directives

`\title` `\subtitle` `\artist` `\album` `\words` `\music` `\tempo` `\capo`
`\lyrics "..."` `\instrument <name|number>` `\tuning <notes>`

Multi-track / multi-voice: `\track "Name"`, `\staff{score}`, `\voice`.

## Per-instrument setup for etude

**Guitar** — no `\tuning` needed. The default is already `E4 B3 G3 D3 A2 E2`.

```
\title "..."
\tempo 90
.
:8 8.6 10.6 7.5 8.5 10.5 7.4 9.4 10.4
```

**Bass** — `\tuning` is required, highest string first. Add `\clef bass` so it
reads on the right staff and `\instrument electricbassfinger` (MIDI 33) so synth
playback sounds like a bass instead of the default guitar:

```
\title "..."
\tuning G2 D2 A1 E1
\clef bass
\instrument electricbassfinger
\tempo 80
.
:4 3.4 5.4 3.3 5.3
```

**Drums** — `\instrument percussion`, then bare MIDI numbers (no `.string`).
Stack simultaneous hits in parens:

```
\title "..."
\instrument percussion
\tempo 90
.
:8 (35 42) 42 (38 42) 42 (35 42) 42 (38 42) 42
```

Numbers alphaTab resolves (its own names):

| # | Piece | # | Piece |
|---|---|---|---|
| 35 | Acoustic Kick Drum | 45 | Tom Low |
| 36 | Kick Drum | 47 | Tom Medium |
| 38 | Snare | 48 | Tom High |
| 40 | Electric Snare | 49 | Crash High |
| 42 | Hi-hat closed ("Charley") | 51 | Ride |
| 44 | Hi-hat pedal | 55 | Splash |
| 46 | Hi-hat open | 57 | Crash Medium |

## Traps — these look right and are not

| Looks right | Actually |
|---|---|
| `:4.` for a dotted quarter | **Parse error.** Dots are `{d}` / `{dd}` on the note. |
| `-` alone as a tie | **Parse error** ("missing string"). Write `-.6`. |
| `\tuning drop-d` | **Parse error.** No preset names — spell the strings: `\tuning D4 A3 F3 C3 G2 D2`. |
| `{text "x"}` | **Unrecognized property.** It is `{txt "x"}`. |
| `\ks Am` | **Parse error.** `\ks` takes a note name: `\ks A`. |
| `(KickHit)` / named drum articulations | **Parse error.** Use the MIDI number: `35`. |

## File extension

The file **must** end `.alphatex`, `.atex`, or `.tex`. `src/notation.ts:13` routes
text by extension; anything else is fetched as binary and renders nothing.
