/**
 * The voice diagnostics log: every stage of a voice session (engine events,
 * parse, dispatch, ui) appends a line, and the Voice log sheet shows and
 * shares it. Three device builds were fixed blind without this; the log is
 * what turns the next report into a diagnosis.
 */
import {
  clearVoiceLog,
  formatVoiceLog,
  getVoiceLog,
  logVoice,
  subscribeVoiceLog,
  VOICE_LOG_CAP,
} from '@/voice/voiceLog';

beforeEach(() => clearVoiceLog());

test('appends entries in order with kind and detail', () => {
  logVoice('engine.start', 'server');
  logVoice('result.partial', '225 4');
  expect(getVoiceLog().map((e) => [e.kind, e.detail])).toEqual([
    ['engine.start', 'server'],
    ['result.partial', '225 4'],
  ]);
});

test('keeps only the newest VOICE_LOG_CAP entries', () => {
  for (let i = 0; i < VOICE_LOG_CAP + 5; i++) logVoice('k', String(i));
  const log = getVoiceLog();
  expect(log).toHaveLength(VOICE_LOG_CAP);
  expect(log[0]!.detail).toBe('5');
});

test('format is one line per entry with seconds since the first entry', () => {
  logVoice('a', 'first', 1000);
  logVoice('b', 'second', 2345);
  logVoice('c', undefined, 2400);
  expect(formatVoiceLog(getVoiceLog())).toBe('+0.000 a first\n+1.345 b second\n+1.400 c');
});

test('subscribers hear every append and clear, and can unsubscribe', () => {
  const seen: number[] = [];
  const unsub = subscribeVoiceLog(() => seen.push(getVoiceLog().length));
  logVoice('a');
  clearVoiceLog();
  unsub();
  logVoice('b');
  expect(seen).toEqual([1, 0]);
});
