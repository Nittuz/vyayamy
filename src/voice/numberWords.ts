const SMALL: Record<string, number> = {
  zero: 0, oh: 0, o: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7,
  eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, thirteen: 13,
  fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
};
const TENS: Record<string, number> = {
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};

const isUnit = (n: number) => n >= 1 && n <= 9;
const isTens = (n: number) => n >= 20 && n <= 90 && n % 10 === 0;
const isTeen = (n: number) => n >= 10 && n <= 19;

/** Parse a spoken or written number ("one eighty five" -> 185). Null if not a number. */
export function wordsToNumber(input: string): number | null {
  const cleaned = input
    .toLowerCase()
    .replace(/-/g, ' ')
    .replace(/\band\b/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (cleaned === '') return null;
  if (/^\d+(\.\d+)?$/.test(cleaned)) return parseFloat(cleaned);

  const tokens = cleaned.split(' ');

  if (tokens.includes('hundred') || tokens.includes('thousand')) {
    let result = 0;
    let current = 0;
    let any = false;
    for (const t of tokens) {
      if (t === 'a') { current += 1; any = true; continue; }
      if (t === 'hundred') { current = (current === 0 ? 1 : current) * 100; any = true; continue; }
      if (t === 'thousand') { result += (current === 0 ? 1 : current) * 1000; current = 0; any = true; continue; }
      if (t in SMALL) { current += SMALL[t]!; any = true; continue; }
      if (t in TENS) { current += TENS[t]!; any = true; continue; }
      return null;
    }
    return any ? result + current : null;
  }

  const vals: number[] = [];
  for (const t of tokens) {
    if (t === 'a') { vals.push(1); continue; }
    if (t in SMALL) { vals.push(SMALL[t]!); continue; }
    if (t in TENS) { vals.push(TENS[t]!); continue; }
    return null;
  }
  if (vals.length === 0) return null;
  if (vals.length === 1) return vals[0]!;

  const [a, b, c] = vals as [number, number, number?];
  // "two oh five" → 205: a hundred, a zero (oh) tens digit, a units digit (#102).
  if (vals.length === 3 && isUnit(a) && b === 0 && c !== undefined && isUnit(c)) return a * 100 + c;
  if (vals.length === 3 && isUnit(a) && isTens(b) && c !== undefined && isUnit(c)) return a * 100 + b + c;
  if (vals.length === 2 && isUnit(a) && (isTens(b) || isTeen(b))) return a * 100 + b;
  if (vals.length === 2 && isTens(a) && isUnit(b)) return a + b;
  return vals.reduce((s, n) => s + n, 0);
}
