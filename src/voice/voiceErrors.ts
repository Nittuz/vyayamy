/**
 * Speech-engine error code → what the card tells the user (Softened
 * Blacktop device QA, build 10: every failure read "Voice unavailable").
 *
 * Codes are expo-speech-recognition's (web-speech names). Each known code maps
 * to the remedy the user can act on; unknown codes stay in the label so the
 * next report carries the diagnosis. `no-speech` is silence, not failure —
 * the session returns to idle.
 */
export function voiceErrorLabel(code: string | undefined): string | null {
  switch (code) {
    case 'no-speech':
      return null;
    case 'not-allowed':
      return 'Microphone or speech access needed. Check Settings.';
    case 'service-not-allowed':
      return 'Voice needs Siri & Dictation on in Settings.';
    case 'network':
      return 'Voice needs a connection right now.';
    case 'language-not-supported':
      return "Voice isn't available for this language.";
    default:
      return code ? `Voice unavailable (${code}).` : 'Voice unavailable.';
  }
}
