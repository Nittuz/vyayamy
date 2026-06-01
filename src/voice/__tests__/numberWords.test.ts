import { wordsToNumber } from '@/voice/numberWords';

describe('wordsToNumber', () => {
  test('parses plain digits', () => {
    expect(wordsToNumber('185')).toBe(185);
    expect(wordsToNumber('5')).toBe(5);
  });

  test('parses single number words', () => {
    expect(wordsToNumber('five')).toBe(5);
    expect(wordsToNumber('ninety')).toBe(90);
    expect(wordsToNumber('fifteen')).toBe(15);
  });

  test('parses colloquial gym numbers', () => {
    expect(wordsToNumber('one eighty five')).toBe(185);
    expect(wordsToNumber('two twenty five')).toBe(225);
    expect(wordsToNumber('one thirty five')).toBe(135);
    expect(wordsToNumber('two seventy')).toBe(270);
    expect(wordsToNumber('one fifteen')).toBe(115);
    expect(wordsToNumber('eighty five')).toBe(85);
  });

  test('parses hyphenated and standard forms', () => {
    expect(wordsToNumber('one-eighty-five')).toBe(185);
    expect(wordsToNumber('a hundred and five')).toBe(105);
    expect(wordsToNumber('one hundred eighty five')).toBe(185);
  });

  test('returns null for non-numeric input', () => {
    expect(wordsToNumber('bench press')).toBeNull();
    expect(wordsToNumber('')).toBeNull();
  });
});
