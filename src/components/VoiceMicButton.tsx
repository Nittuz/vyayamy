import { useMemo } from 'react';
import { Pressable, StyleSheet } from 'react-native';

import { Icon } from '@/ui/icons';
import { Text } from '@/ui/Text';
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
 */
export function VoiceMicButton({ phase, onTap, onHoldStart, onHoldEnd }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const listening = phase === 'listening';
  const labelColor = listening ? theme.color.onAccent : theme.color.inkSecondary;
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
        {
          backgroundColor: listening ? theme.color.accent : theme.color.surface,
          borderColor: listening ? theme.color.accent : theme.color.border,
          opacity: phase === 'disabled' ? 0.4 : pressed ? 0.85 : 1,
        },
      ]}
    >
      <Icon name="mic" size={16} color={labelColor} />
      <Text variant="label" color={labelColor}>
        {listening ? 'Listening · tap to stop' : 'Voice'}
      </Text>
    </Pressable>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    btn: {
      height: 44,
      borderRadius: theme.radius.full,
      borderWidth: theme.depth.rule,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: theme.space.s2,
      marginHorizontal: theme.space.s5,
    },
  });
