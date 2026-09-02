# etude — Web Rewrite Design Spec

**Status:** approved design, ready for implementation planning.
**Date:** 2026-08-30.
**Provenance:** distilled from `WEB-REWRITE-BRIEF.md` (this repo) plus a design session
with the owner. Where this spec and the brief disagree, this spec wins — every
deviation was an explicit owner decision. Visual direction was approved from live
mockups ("Manuscript, day & night", section 4 of the direction board artifact).

This spec is self-contained: an implementer should not need the JUCE codebase.

---

## 1. What is being built

A **static web app** named **etude** that replaces the JUCE macOS guitar practice
tool. It runs a timed practice session: a three-step wizard picks one instrument,
one exercise category, and a duration; the app then serves weighted-random exercises
from that category until the user stops. Exercises are notation files rendered
in-page (alphaTab), YouTube embeds, GrooveScribe embeds, Soundslice cards that
open externally, or text. A Web Audio metronome arrives **pre-set to a bpm rolled from the
exercise's `metronome_range`** — this is the single most valued feature and must
survive every refactor.

No backend, no accounts, no database, no running cost.

### Locked platform decisions

| Decision | Value |
|---|---|
| Repo | New **public** GitHub repo `etude` (separate from `guitar-practice-tool`) |
| Hosting | GitHub Pages at `alonzolopez.github.io/etude`, deployed by GitHub Actions on every push |
| Stack | Vanilla TypeScript + Vite. No framework. |
| Notation | **alphaTab** (MPL-2.0, self-hosted) renders repo-hosted Guitar Pro/MusicXML files in-page with synth playback. |
| Content | Per-instrument JSON files under `public/exercises/`, fetched at runtime from the same deploy. No raw.githubusercontent variant. |
| The JUCE app | Untouched in its own repo until etude has earned its place. Nothing in etude may depend on it beyond the one-time content migration. |

### Out of scope (deliberate, from the brief §3)

In-app exercise editing; auth/accounts/datastore; practice history & progress
tracking (future separate project); offline support; audio input; multi-channel
audio routing.

---

## 2. Content model

### 2.1 Content files and schema

Content lives in `public/exercises/`, split per instrument so each file stays small
to hand-edit (the owner plans to expand bass and drums):

- `index.json` — the instrument manifest:
  `{"instruments": [{"id": "guitar", "name": "Guitar", "file": "guitar.json", "hotkey": "g"}, …]}`
- `guitar.json`, `bass.json`, `drums.json` — one per instrument:

  ```json
  {
    "instrument": "Guitar",
    "categories": [
      { "key": "scales", "name": "Scales", "exercises": [ … ] }
    ]
  }
  ```

Category array order is wizard display order. A category's name and its exercises
live in **one place** — the old format split them between a name map and a separate
keyed array, an editing hazard. Everything is data-driven: new exercises,
categories, or instruments are content edits only.

Per exercise:

| Field | Type | Meaning |
|---|---|---|
| `title` | string, required | shown as the exercise title |
| `weight` | number, required | relative draw probability within its category |
| `url` | string, optional | Soundslice secret link, YouTube embed, or GrooveScribe URL |
| `file` | string, optional | repo path under `public/notation/<instrument>/` to a Guitar Pro, MusicXML, or alphaTex file; may contain `{root}` and `{position}` placeholders, expanded per draw; takes precedence over `url` |
| `key` | string[], optional | one drawn at random per load |
| `position` | int[], optional | one drawn at random, shown as `pos N` |
| `metronome_range` | [int, int], optional | bpm drawn uniformly (integer, inclusive) per load |
| `description` | string, optional | body text |

**Exercise types are exactly five.** `file` wins over `url`; otherwise the `url`
host classifies:

1. **Notation** — `file` present: a repo-hosted Guitar Pro (preferred for
   Soundslice exports), MusicXML, or alphaTex file (the format for newly
   authored exercises, §12) rendered **in-page by alphaTab** with synth
   playback — fully inline, no iframe, API-driven (§8.1). The intended end
   state for most Soundslice content.
2. **Soundslice** — `soundslice.com` url: rendered as an in-app **card** — title,
   key line, rolled bpm, description — with an "Open in Soundslice ↗" action
   opening the secret link in a new tab (§8.2). Inline is impossible: player
   pages send `X-Frame-Options: DENY`, and embeds are gated behind a licensing
   plan with a $100/month floor (both verified 2026-08-30). Converting an
   exercise to type 1 is a pure content edit (§2.2).
3. **YouTube** — `youtube.com` / `youtube-nocookie.com`, inline iframe,
   API-driven (§8.3)
4. **GrooveScribe** — `mikeslessons.com/groove` drum-groove URLs, plain iframe,
   no API control (`space` drives the metronome instead, §4.1). First-class and
   fully supported: the owner will keep adding these. Any other `url` host
   renders the same way (plain iframe), so a new embeddable source degrades
   gracefully rather than erroring.
5. **Text** — no `url`, no `file`.

The fields `images`, `example`, `backing_track`, `starting_string`, `original_key`, and
`mode` are **removed from the schema and never read**. Unknown fields in the
JSON are ignored, not errors.

Text exercises are flagged as *possibly temporary* — the owner may later convert
them to the notation type (e.g. via Claude-generated MusicXML or alphaTex, §12).
Design nothing that assumes text exercises are permanent, but support them fully.

### 2.2 One-time migration

Produce `public/exercises/*.json` from the JUCE repo's `exercises.json`:

1. Split into the per-instrument files and shape of §2.1, plus `index.json`.
2. Delete the exercise titled **"The Altered Scale"** (category `scales`) — the only
   `images` user.
3. Strip `images`, `example`, `backing_track`, `starting_string` from all exercises
   (no `original_key` occurrences exist).
4. Normalize URLs. A 2026-08-30 audit of the 59 urls found: 34 Soundslice, 14
   YouTube (13 on `youtube-nocookie.com`), 11 GrooveScribe.
   - **Soundslice secret links stay exactly as stored** (`…/slices/<id>/`). Do
     not rewrite to `/embed/`: player pages send `X-Frame-Options: DENY` and
     embeds are licensing-gated, so neither form can be framed (verified
     2026-08-30 — the JUCE app only displayed them because a WebView is
     top-level navigation, not a frame). The urls serve as external links only.
   - Unescape `&amp;` → `&` (one YouTube url carries it).
   - Keep `youtube-nocookie.com` hosts as-is (the IFrame API supports them).
   - GrooveScribe URLs pass through unchanged.

**Incremental Soundslice → notation conversion (owner-paced, after v1):** for any
slice: export it from Soundslice (edit slice → Export → **GPX** preferred,
MusicXML otherwise — both supported for your own slices), commit the file under
`public/notation/<instrument>/`, set the exercise's `file` field, drop its `url`. No code
changes per conversion. Song-synced slices lose their real-recording sync under
alphaTab's synthesis, so the owner intends to keep those (e.g. the Khruangbin
jam tracks) as Soundslice cards **permanently** — the card is a permanent
surface, not a transitional one, and gets full design care.

**Verify before building UI on top:** (a) the alphaTab pipeline end-to-end — the
owner exports one real slice as GPX; alphaTab renders and plays it; (b)
`mikeslessons.com` allows iframing. If a host refuses framing, its exercises fall
back to description text plus a link opening in a new tab.

Also copy `assets/ZZZZ-metronome-click-warm.mp3` from the JUCE repo to
`public/click.mp3`. These are the only artifacts taken from the old repo.

---

## 3. Screens and flow

Two surfaces: the **wizard** (home) and the **practice screen**.

### 3.1 Wizard

Three full-screen steps, each a single question with large keyed buttons (touch
targets sized for an iPad on a music stand), a "Step n of 3" eyebrow, and the
step's hotkeys printed on the buttons as keycap chips.

1. **Instrument** — Guitar `g` · Bass `b` · Drums `d`. Only instruments with at
   least one category appear.
2. **Category** — the chosen instrument's categories in JSON order, hotkeys `1`–`9`,
   each button showing its exercise count (e.g. "Scales — 11"). More than 9
   categories: buttons remain tappable/clickable; only the first 9 get hotkeys.
3. **Duration** — a minutes **text box** plus preset buttons `5 · 10 · 15 · 20 · 30`
   on hotkeys `1`–`5`. A preset key **populates the text box** (replacing its
   contents); it does not start the session. **`enter` — and only `enter` (or the
   Start button) — starts.** The box arrives *unfocused*, pre-filled with the
   last-used duration (default 5). Focus behavior is governed by the focus rule
   (§4.2). Invalid or empty box on `enter`: refuse with an inline message, don't
   start.

Navigation: `esc` or `←` goes back one step; wizard steps are History API entries so
the browser/iPad-edge-swipe back gesture does the same. Fastest path from cold:
`g` `2` `3` `enter`. The first interaction doubles as the user gesture that unlocks
the `AudioContext`.

The old `s` (start) and `c` (clear selections) hotkeys are retired with the
checkbox home page.

### 3.2 Practice screen

Layout (approved from the direction-board mockup): title and key/position line top-left;
session timer top-right; embed area center (visually dominant); metronome unit and
transport in a bottom bar.

- **Title + key line.** Key line renders only the parts that exist: random key from
  `key[]`, ` · pos N` from `position[]`.
- **Content area.** By exercise type: notation renders alphaTab's surface (with
  its playback cursor), themed per §7; YouTube/GrooveScribe render an iframe; a
  Soundslice exercise renders its **card** — title, key line, rolled bpm,
  description, and a large "Open in Soundslice ↗" button (secret link, new tab);
  text exercises show `description` (or, lacking one, the title alone, large) as
  well-set centered text — never an empty frame. All control flows through the
  parent page (§8); the user should never need to click inside an iframe.
- **Metronome unit** (§6): always present. With `metronome_range`: pre-set to the
  rolled bpm. Without: keeps its previous bpm. Never auto-plays.
- **Transport:** Previous `←`, Next `→` (primary), Home `h`, each with keycap chips.
- **Session timer:** counts down; at zero, a gentle chime plays once and the timer
  switches to counting **up** in the accent red. Nothing else interrupts — the
  exercise, embed, and metronome continue until the user leaves (`h`).
- A single **session volume** control (§4.1) and a theme override control (§7) exist
  on this screen, visually quiet.

### 3.3 Session semantics

- **Draw:** weighted random **with replacement** within the session's one category.
  Repeats are accepted behavior (the owner wants e.g. Dorian twice in different
  keys; `→` is the skip). No repeat-avoidance logic.
- **Materialization:** at draw time, roll key, position, and bpm, then expand the
  exercise's `file` template against those rolls. The displayed exercise is an
  *instance*; see §5 history.
- **Timer:** derives remaining time from wall-clock deltas (`Date.now()` against a
  stored start instant), never from accumulated tick counts — background-tab
  throttling must not bend it. No pause facility (parity with today).
- **Refresh/reload mid-session:** returns to the wizard. Accepted.

---

## 4. Input model

### 4.1 Key map

| Key | Where | Action |
|---|---|---|
| `g` / `b` / `d` | Wizard 1 | choose instrument, advance |
| `1`–`9` | Wizard 2 | choose category, advance |
| `1`–`5` | Wizard 3 | populate duration box with 5/10/15/20/30 |
| `enter` | Wizard 3 | start session with the box's value |
| `esc` / `←` | Wizard | back one step (`esc` first blurs a focused input, §4.2) |
| `→` | Practice | next exercise (new draw at head; replay when behind head) |
| `←` | Practice | previous exercise (restore exact instance) |
| `space` | Practice | play/pause the exercise's **player** when controllable (alphaTab notation, YouTube), else the metronome (`preventDefault` so the page never scrolls) |
| `m` | Practice | metronome play/pause, always |
| `↑` / `↓` | Practice | session volume up/down |
| `shift+↑` / `shift+↓` | Practice | metronome bpm +1 / −1 (hold to repeat) |
| `h` | Practice | home (back to wizard) |

**Session volume** is one value (0–100, `↑`/`↓` move it in steps of 5) driving the
metronome gain node and the current player's volume (alphaTab `masterVolume`,
YouTube `setVolume`). Persisted on-device.

`space` preferring the player is the successor of the old backing-track-first
priority chain, and is the owner-confirmed behavior.

Every hotkey action has an on-screen control — on iPad there is no keyboard. A
Bluetooth page-turner pedal (emits `←`/`→`) drives previous/next with no extra code.

### 4.2 The focus rule

Single-key hotkeys are **suspended while any text input has focus** (the hotkey
layer checks the active element). Digits typed into the duration box are literal
(`12` means twelve minutes, not preset-1-then-2). `enter` works in both states.
`esc` blurs a focused input; pressed again (or when nothing is focused) it performs
its navigation action.

### 4.3 Hotkeys-armed indicator

If a cross-origin iframe steals keyboard focus, the parent stops receiving keys —
a security boundary, not a bug to fix. Because all controls live in the parent,
this should be rare. When it happens (parent detects focus entering the iframe),
the keycap chips **dim** as a visible "hotkeys disarmed" signal; a click/tap
anywhere in the parent chrome re-arms them.

---

## 5. Back navigation (history)

The history is a stack of **materialized instances** — `{categoryKey, exercise
title/index, rolled key, rolled position, current bpm, url or resolved file}` — never bare
exercise ids, because a re-draw would produce a different key/position/bpm and make "back"
pointless.

- `←` restores the previous instance **exactly**, including bpm. If the user tweaks
  bpm during an exercise, the tweak is written into the instance, so back/forward
  returns what the user actually had.
- `→` behind the head replays forward through the stack; a fresh random draw happens
  only at the head.
- Drawing new after going back **truncates** the forward stack (browser semantics).
- The stack rides the History API (`pushState`/`popstate`), so the browser back/
  forward gestures — including the iPad edge swipe — are equivalent to `←`/`→`, and
  wizard steps participate in the same model.

**GitHub Pages constraint:** Pages serves static files from the repo subpath, so a
refresh on a pushed *path* would 404. History entries must therefore never change
the URL path — push state objects on the same URL (or use a hash). Refresh always
lands on `index.html` → wizard.

---

## 6. Metronome engine

- **Web Audio, sample-scheduled.** A lookahead loop (the standard "Tale of Two
  Clocks" pattern: a coarse `setInterval` that schedules ahead) places
  `AudioBufferSourceNode.start(t)` calls against `audioContext.currentTime`.
  Clicks are never driven directly from `setTimeout`/`setInterval` ticks.
- Click sample: `public/click.mp3` (from the JUCE app). Routed through a gain node
  (session volume).
- bpm: integer; pre-set per exercise from `metronome_range` (uniform integer,
  inclusive); adjustable via `shift+↑/↓` and on-unit steppers.
- The **lamp pulses from the scheduler** — the same code that schedules a click
  schedules its visual flash — never from an independent CSS animation guessing the
  tempo. Under `prefers-reduced-motion`, the lamp stays static.
- The session-end chime is synthesized with Web Audio (two soft tones; no asset),
  played through the same gain node.
- The `AudioContext` is created/resumed on the first user gesture (any wizard
  interaction qualifies).

---

## 7. Visual identity — "Manuscript, day & night"

One identity on two grounds: music paper by day, the music stand at night. Approved
from the direction-board mockups; the board artifact is the visual reference.

### 7.1 Tokens

| Token | Day (paper) | Night (stand) |
|---|---|---|
| ground | `#f7f2e7` | `#1d1a15` |
| surface | `#f1ead9` | `#262118` |
| ink | `#1e1b16` | `#ece5d4` |
| muted | `#8d8371` | `#94897a` |
| line | `#d9d1bd` | `#363028` |
| accent (pencil red) | `#b5442e` | `#cf5a41` |
| amber (lamp) | `#c8811f` | `#e89b3c` |
| amber readout | `#b1720f` | `#e89b3c` |

The **metronome unit themes with the page** (day: surface card, ink text; night:
dark card `#221d17`, ivory text `#ede4d3`). Its *identity constants* across themes
are the pulsing amber lamp and the mono readout — not a fixed chassis color (the
dark-chassis-on-paper variant was reviewed and rejected).

### 7.2 Type

- **Fraunces** — display: exercise titles, wizard option labels.
- **Source Serif 4** — body, UI labels, and the session timer (`tabular-nums`).
- **IBM Plex Mono** — the metronome readout and keycap chips only.

Google Fonts with real fallback stacks (Georgia/serif; monospace). Radii: 4px on
paper elements, 10px on the metronome unit. Borders 1px.

### 7.3 Theming behavior

- Follows `prefers-color-scheme` by default; a quiet manual override
  (auto / light / dark) is persisted on-device.
- alphaTab notation renders through the same tokens (paper/ink by day, ivory on
  dark at night) via its color settings, re-rendered on theme change.
- CSS is token-driven (custom properties); no color may exist only inside a media
  query. Both themes get equal design care.
- Motion: the beat lamp is the one animated element; `prefers-reduced-motion`
  disables it. Keyboard focus is always visible. Controls are real `<button>`s with
  labels.

---

## 8. Content integration

### 8.1 Notation (alphaTab)

- **alphaTab** (MPL-2.0) renders `public/notation/*` files — Guitar Pro
  (preferred: alphaTab's most mature importer), MusicXML, or alphaTex — as
  standard notation + tab in-page, with built-in synth playback, tempo control,
  and looping. Binary formats load via alphaTab's file loader; alphaTex files
  (`.alphatex`) are fetched as text and loaded via `api.tex()`.
- Self-hosted assets: the alphaTab package, its music font, and its soundfont
  ship with the deploy — no CDN.
- Driven directly through its JS API: play/pause for `space`, `masterVolume`
  for the session volume. Playback runs at the file's own tempo in v1; mapping
  the rolled bpm onto alphaTab's playback speed is a noted later enhancement,
  not v1.
- Notation colors follow the §7 tokens in both themes.
- No iframe: no focus boundary, no armed-indicator concerns for these exercises.

### 8.2 Soundslice (card + external link)

- No inline rendering is possible (§2.1 type 2). The card's "Open in
  Soundslice ↗" opens the stored secret link in a new tab (`target="_blank"`,
  `rel="noopener"`); on iPad this may hand off to the Soundslice app.
- The metronome keeps running while the user is in the other tab — see §11.8.

### 8.3 YouTube

- Load with `enablejsapi=1` and drive via the IFrame Player API: `playVideo`,
  `pauseVideo`, `setVolume`. Works on `youtube-nocookie.com` hosts.
- `enablejsapi=1` is appended respecting any query string the stored url
  already carries (most carry `?si=…`).

### 8.4 Shared player contract

One interface (`play()`, `pause()`, `toggle()`, `setVolume(v)`, plus a
`controllable` flag) with alphaTab and YouTube implementations, and a no-op
serving text exercises, Soundslice cards, and uncontrollable iframes
(GrooveScribe, other hosts). The hotkey layer reads `controllable` to route
`space` and volume to the metronome instead; the practice screen never branches
on player type.

---

## 9. Architecture

### 9.1 Repo layout

```
etude/
  CLAUDE.md                 # required — see §10
  index.html
  package.json  vite.config.ts  tsconfig.json
  .github/workflows/deploy.yml
  public/
    exercises/
      index.json            # instrument manifest
      guitar.json           # the content — edit here, push, live in ~1 min
      bass.json
      drums.json
    notation/               # authored/exported notation, one subtree per instrument
      guitar/               # scales/<mode>/<root>/p<N>[-up].alphatex, arpeggios/<chord>/<root>/…
                            #   p<N> = lowest placement of the shape, p<N>-up = twelve frets higher
      bass/
      drums/
    click.mp3
  src/
    main.ts                 # boot, screen switching
    exercises.ts            # fetch/parse/validate; weighted draw; materialization
    history.ts              # instance stack + History API adapter
    session.ts              # duration, wall-clock timer, overtime, chime trigger
    metronome.ts            # Web Audio engine (§6)
    notation.ts             # alphaTab wrapper: load, theme, player adapter (§8.1)
    players.ts              # player contract + YouTube/no-op adapters (§8.4)
    hotkeys.ts              # key layer + focus rule (§4)
    theme.ts                # auto/light/dark + persistence
    screens/wizard.ts
    screens/practice.ts
    styles/tokens.css       # §7 tokens, both themes
    styles/*.css
  tests/                    # Vitest
```

Modules hold the logic; `screens/*` do DOM wiring. Every module answers: what it
does, how it's used, what it depends on — no circular imports; `screens/*` depend on
modules, never the reverse.

### 9.2 Persistence (localStorage, conveniences only)

`etude.duration`, `etude.volume`, `etude.bpm` (last metronome bpm),
`etude.theme` (override). All reads wrapped so a missing/blocked store never breaks
the app.

### 9.3 Deploy

GitHub Actions on push to the default branch: `npm ci` → `vite build` → upload
`dist/` → `actions/deploy-pages`. Vite `base` set to `/etude/`. One-time manual
step: enable Pages (source: GitHub Actions) in repo settings.

### 9.4 Testing

- **Vitest** on pure logic: weighted draw distribution and edge cases;
  materialization ranges (key/position membership, bpm bounds inclusive); history stack
  semantics (back/forward/truncate, bpm-tweak write-back); timer math
  (wall-clock, overtime transition); scheduler lookahead math against a mocked
  clock/context; hotkey layer routing incl. the focus rule.
- **Manual checklist** for what needs real players and hardware: alphaTab
  rendering and playback of real exported files (desktop and iPad Safari),
  YouTube control, Soundslice card link-out and return, touch targets,
  edge-swipe history, add-to-home-screen, audio unlock, pedal (`←`/`→`), both
  themes.

Implementation follows the superpowers TDD workflow.

---

## 10. CLAUDE.md files

The repo ships with agent instructions from day one:

- **Root `CLAUDE.md` (required):** what etude is; dev commands (`npm run dev`,
  `build`, `test`); how content editing works (edit the files under `public/exercises/`, push,
  auto-deploy — file shapes and schema from §2.1; the Soundslice → notation
  conversion flow from §2.2); the hotkey map; module map (one line per
  `src/` module); the token/theming rules (no colors outside `tokens.css`; both
  themes always); deploy notes.
- **Subdirectory CLAUDE.md files** wherever a directory carries conventions not
  obvious from its code (candidates: `public/` for the content-editing contract,
  `src/` for the module-dependency rule). Add them where they earn their place, not
  ritually.

---

## 11. Risks and subtleties (implementer notes)

1. **History on Pages** — never push URL paths (§5). This is the easiest way to
   ship a refresh-404.
2. **Iframe focus** — never require a click inside the embed; that's what the
   adapters are for. The armed indicator (§4.3) covers the residual case.
3. **AudioContext unlock** — must be tied to a real user gesture; the wizard
   guarantees one before any practice screen exists.
4. **Timer integrity** — wall-clock only; test the background-tab case.
5. **alphaTab maturity gradient** — its Guitar Pro importer is more mature than
   its MusicXML importer: prefer GPX exports, and prove the pipeline with real
   exported files before any styling work. Its music-font and soundfont assets
   must be self-hosted and add a few MB to the deploy — fine for Pages.
6. **Browser output latency** (~20–40 ms) is a constant offset, not jitter —
   inaudible for play-along; do not "compensate" for it.
7. **Verification comes first** — the §2.2 checks (alphaTab pipeline on a real
   exported slice; `mikeslessons.com` framing) run before UI work, because their
   outcome decides whether fallbacks are needed at all. The slice exports are an
   owner task — the implementer should ask rather than guess.
8. **Metronome while the tab is backgrounded** — opening a Soundslice card
   switches tabs, and background throttling of `setInterval` must not starve the
   lookahead scheduler. Widen the scheduling horizon on `visibilitychange` so
   the click survives being backgrounded.

---

## 12. Deferred: exercise-authoring skills (out of scope — do not forget)

After implementation, the owner will create **Claude Code skills in the etude
repo** for adding new exercises. Sketch, so a future session can pick this up:
given a YouTube or GrooveScribe URL, a Soundslice export (GPX/MusicXML), or
notation Claude generates itself (MusicXML or alphaTex — alphaTab renders both),
plus metadata (instrument, category, title, weight, optional
key/position/metronome_range/description), a skill validates against §2.1, places any
notation file under `public/notation/<instrument>/`, and inserts the exercise into the
right `public/exercises/*.json` — creating a category when needed, normalizing per
§2.2's rules. A companion skill drives the incremental Soundslice → notation
conversion. The §2.1 file shapes are the contract these skills target; the
implementer builds nothing for this, but should not make the content files
harder to machine-edit than the spec already describes.

**Delivered 2026-08-31 — the conversion half.** `.claude/skills/convert-soundslice/`:
locate the exercise by title, url, or slice id (slice ids are reused across
instrument files, so it refuses to guess); parse-proof the export headlessly with
alphaTab's own `ScoreLoader`; one-line `url` → `file` edit; `tests/content.test.ts`
as the gate. It also covers adding an exercise for a notation file that matches
none. Still open: the general authoring skill for YouTube / GrooveScribe URLs with
full metadata and category creation.
