import { useEffect, useMemo, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/ui/icons';
import { resolvePlateStyles, resolvePressedStyle } from '@/ui/plateStyles';
import { Text } from '@/ui/Text';
import { useReduceMotion } from '@/ui/useReduceMotion';
import { useTheme, type Theme } from '@/ui/useTheme';

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
 * Volt is the act-now state: it appears ONLY while actively listening.
 * Idle is a ghost. (Plate itself can't host this control - hold-to-talk
 * needs onPressOut - so the tone maths come from resolvePlateStyles.)
 */
export function VoiceMicButton({ phase, onTap, onHoldStart, onHoldEnd }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
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
      <Icon name="mic" size={16} color={plate.ink} />
      <Text variant="meta" color={plate.ink}>
        {listening ? 'Listening · tap to stop' : 'Voice'}
      </Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    btn: {
      height: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.space.s2,
      marginHorizontal: theme.space.s5,
    },
    disabled: { opacity: 0.4 },
  });
