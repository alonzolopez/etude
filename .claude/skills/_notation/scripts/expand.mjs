// The slug and expansion rules, for the CLI scripts.
//
// This is a deliberate duplicate of `rootSlug`, `templateAxes` and `resolveFile`
// in src/exercises.ts, sanctioned by the design's "Slug and expansion rules"
// section on one condition, which tests/expand-agreement.test.ts meets: a vitest
// asserts the two implementations agree, so changing one without the other is a
// red test rather than a silent drift.
//
// Why not import src/exercises.ts directly: it is TypeScript, so a plain .mjs can
// only load it through Node's experimental type stripping, which prints
// `ExperimentalWarning: Type Stripping` and `MODULE_TYPELESS_PACKAGE_JSON` to
// stderr on every invocation — human and test alike. tests/add-exercise.test.ts
// folds stderr into the output it asserts on, and silencing the warnings needs
// either `--disable-warning=` on every invocation or a monkey-patch of Node's
// warning machinery inside the one script whose job is to fail loudly. It would
// also pin the content writer to an experimental feature that CI's floating
// `node-version: 22` does not guarantee.
//
// Keep this file in step with src/exercises.ts.

const ROOT_TOKEN = /^([A-G])([#b]?)/;
const PLACEHOLDER = /\{(\w+)\}/g;

/** The pitch-class slug of a key string: "A# dorian" -> "a-sharp". */
export function rootSlug(key) {
  const m = ROOT_TOKEN.exec(key.trim());
  if (!m) throw new Error(`unparseable key: "${key}"`);
  const accidental = m[2] === '#' ? '-sharp' : m[2] === 'b' ? '-flat' : '';
  return m[1].toLowerCase() + accidental;
}

const AXES = {
  root: (file, key) => {
    if (key === undefined) throw new Error(`{root} needs a rolled key: ${file}`);
    return rootSlug(key);
  },
  position: (file, _key, position) => {
    if (position === undefined) throw new Error(`{position} needs a rolled position: ${file}`);
    return String(position);
  },
};

/** Every axis resolveFile() can expand. */
export const FILE_AXES = Object.keys(AXES);

/** The placeholder names a `file` references. A literal path names none. */
export function templateAxes(file) {
  return new Set([...file.matchAll(PLACEHOLDER)].map((m) => m[1]));
}

/** Expand a `file` against one variant; a placeholder-free path is unchanged. */
export function resolveFile(file, key, position) {
  return file.replace(PLACEHOLDER, (_, name) => {
    const axis = AXES[name];
    if (!axis) throw new Error(`unknown placeholder {${name}} in ${file}`);
    return axis(file, key, position);
  });
}
