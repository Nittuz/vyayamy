/**
 * The speech engine's error CODE decides what the card says (build 10 on
 * device: every failure read "Voice unavailable", which hid that the phone had
 * silently fallen back to Apple's server recognition and then failed there).
 * Each known code maps to the remedy the user can actually act on; unknown
 * codes stay visible so the next report carries them.
 */
import { voiceErrorLabel } from '@/voice/voiceErrors';

test('permission codes point at Settings', () => {
  expect(voiceErrorLabel('not-allowed')).toBe(
    'Microphone or speech access needed. Check Settings.',
  );
});

test('a disabled recognizer points at Siri & Dictation', () => {
  expect(voiceErrorLabel('service-not-allowed')).toBe(
    'Voice needs Siri & Dictation on in Settings.',
  );
});

test('a network failure says so — server recognition needs a connection', () => {
  expect(voiceErrorLabel('network')).toBe('Voice needs a connection right now.');
});

test('an unsupported language is named', () => {
  expect(voiceErrorLabel('language-not-supported')).toBe(
    "Voice isn't available for this language.",
  );
});

test('unknown codes stay diagnosable', () => {
  expect(voiceErrorLabel('audio-capture')).toBe('Voice unavailable (audio-capture).');
  expect(voiceErrorLabel('')).toBe('Voice unavailable.');
  expect(voiceErrorLabel(undefined)).toBe('Voice unavailable.');
});

test('no-speech is not a failure: the session just went quiet', () => {
  expect(voiceErrorLabel('no-speech')).toBeNull();
});
