import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/ui/icons';
import { resolvePlateStyles, resolvePressedStyle } from '@/ui/plateStyles';
import { useReduceMotion } from '@/ui/useReduceMotion';
import { useTheme } from '@/ui/useTheme';

interface Props {
  phase: 'idle' | 'listening' | 'disabled';
  onTap: () => void;
  onHoldStart: () => void;
  onHoldEnd: () => void;
}

/**
 * Mic control for the active-set card. Tap toggles a hands-free listening
 * session; long-press is the hold-to-talk fallback for noisy moments.
 *
 * Icon-only (copy review Batch V): no visible label. The mic glyph is one of
 * the few universally-read icons, the "What can I say?" trigger directly
 * beneath already names the modality, and the LISTENING state is narrated on
 * the set card itself ("Listening…", live partials, "Heard X. Say yes to
 * confirm") — a status word on the button itself would just duplicate the
 * card. A11y labels stay unabridged ("Start/Stop voice logging") since a
 * screen-reader user never sees the mic glyph or the adjacent copy.
 *
 * Volt is the act-now state: it appears ONLY while actively listening.
 * Idle is a ghost. (Plate itself can't host this control - hold-to-talk
 * needs onPressOut - so the tone maths come from resolvePlateStyles.)
 */
export function VoiceMicButton({ phase, onTap, onHoldStart, onHoldEnd }: Props) {
  const theme = useTheme();
  const listening = phase === 'listening';

  // Live reduced-motion (Plate precedent): the press dip drops its scale
  // component and keeps the opacity dip only. A ref, not state, so it doesn't
  // force a re-render on toggle — only read from the pressed-style callback,
  // never mid-render, so the sync can run in an effect.
  const reduceMotion = useReduceMotion();
  const reduceMotionRef = useRef(reduceMotion);
  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  const plate = resolvePlateStyles(theme, { tone: listening ? 'volt' : 'ghost' });

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={listening ? 'Stop voice logging' : 'Start voice logging'}
      accessibilityState={{ disabled: phase === 'disabled', busy: listening }}
      disabled={phase === 'disabled'}
      onPress={onTap}
      onLongPress={onHoldStart}
      onPressOut={onHoldEnd}
      style={({ pressed }) => [
        styles.btn,
        plate.face,
        pressed && resolvePressedStyle(reduceMotionRef.current),
        phase === 'disabled' && styles.disabled,
      ]}
    >
      <Icon name="mic" size={24} color={plate.ink} />
    </Pressable>
  );
}

// No theme dependency — fixed geometry, no tokenized color/spacing — so this
// is a plain module-level StyleSheet rather than a per-render makeStyles.
const styles = StyleSheet.create({
  // Compact and centered, not a full-width row — the voiceArea column
  // stretches children by default, so this control must self-center via
  // alignSelf rather than filling the row like the old label button did.
  btn: {
    alignSelf: 'center',
    width: 56,
    height: 56,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: { opacity: 0.4 },
});
