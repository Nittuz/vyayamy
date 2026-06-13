/**
 * Conventions guard: no hard-coded colors outside the palette.
 *
 * The Forged Iron rule is that every color comes from useTheme() tokens, which
 * trace back to the single source of truth in src/ui/colors.ts. A stray hex
 * literal anywhere else is a palette leak — it can't reskin, it dodges the
 * contrast suite, and it drifts. This test fails on any hex literal in src/
 * outside the sanctioned files.
 */
import { readdirSync, readFileSync, statSync } from 'fs';
import { join } from 'path';

const SRC = join(__dirname, '..', '..');

// Files allowed to contain literal colors: the palette itself.
const ALLOWED = new Set([join(SRC, 'ui', 'colors.ts')]);

// 6-digit (#RRGGBB) or 8-digit (#RRGGBBAA) only — the forms real colors take.
// Matching 3-digit would snag issue references like (#131) in comments.
const HEX = /#[0-9a-fA-F]{6}(?:[0-9a-fA-F]{2})?\b/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    const st = statSync(full);
    if (st.isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      walk(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.test\.tsx?$/.test(name)) {
      out.push(full);
    }
  }
  return out;
}

describe('no hard-coded colors outside the palette', () => {
  const files = walk(SRC);

  test('there is something to scan', () => {
    expect(files.length).toBeGreaterThan(20);
  });

  for (const file of files) {
    if (ALLOWED.has(file)) continue;
    test(`${file.slice(SRC.length + 1)} has no hex color literals`, () => {
      const offending = readFileSync(file, 'utf8')
        .split('\n')
        .map((line, i) => ({ line, n: i + 1 }))
        .filter(({ line }) => HEX.test(line));
      expect(offending.map((o) => `${o.n}: ${o.line.trim()}`)).toEqual([]);
    });
  }
});
