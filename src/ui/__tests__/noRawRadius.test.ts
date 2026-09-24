/**
 * Conventions guard (Softened Blacktop): every corner comes from
 * theme.radius, and every TextInput border comes from resolveInputStyle.
 * A raw `borderRadius: 12` or a hand-drawn input border is exactly how the
 * seven drifting input styles happened. This scans src/ and app/ the same
 * way noRawHex.test.ts scans for colors.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join, relative } from 'path';

const REPO = join(__dirname, '..', '..', '..');
const ROOTS = [join(REPO, 'src'), join(REPO, 'app')];

// The only files allowed to write a radius or an input border from scratch.
const ALLOWED = new Set([
  join(REPO, 'src', 'ui', 'useTheme.tsx'), // the scale itself
  join(REPO, 'src', 'ui', 'inputStyles.ts'), // the one input style
]);

// `borderRadius: 12` / `borderTopLeftRadius: 0` etc. with a numeric literal.
const RAW_RADIUS = /border(?:Top|Bottom)?(?:Left|Right)?Radius:\s*-?\d/;
// A style block keyed input*/search* that draws its own border, e.g.
//   input: { ..., borderWidth: theme.depth.hairline, ... }
const INPUT_BLOCK = /^\s*(?:input|search)\w*:\s*\{[^}]*\}/gms;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules' || name === '__mocks__') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('no raw radii or hand-rolled input borders outside the tokens', () => {
  const files = ROOTS.flatMap((root) => walk(root));

  test('there is something to scan', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const file of files) {
    if (ALLOWED.has(file)) continue;
    const rel = relative(REPO, file);
    test(`${rel} takes every radius from theme.radius`, () => {
      const offending = readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => RAW_RADIUS.test(line));
      expect(offending.map((o) => `${o.n}: ${o.line.trim()}`)).toEqual([]);
    });
    test(`${rel} does not draw its own input border`, () => {
      const source = readFileSync(file, 'utf8');
      const blocks = source.match(INPUT_BLOCK) ?? [];
      const offending = blocks.filter((b) => /borderWidth/.test(b));
      expect(offending.map((b) => b.trim().split('\n')[0])).toEqual([]);
    });
  }
});
