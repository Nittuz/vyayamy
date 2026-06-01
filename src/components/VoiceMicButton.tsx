import { Pressable, StyleSheet, Text } from 'react-native';

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
 */
export function VoiceMicButton({ phase, onTap, onHoldStart, onHoldEnd }: Props) {
  const theme = useTheme();
  const listening = phase === 'listening';
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
      <Text
        style={[
          styles.label,
          {
            color: listening ? theme.color.onAccent : theme.color.inkSecondary,
            fontFamily: theme.font.family.sansMedium,
          },
        ]}
      >
        {listening ? '◉  Listening · tap to stop' : '🎙  Voice'}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    height: 44,
    borderRadius: 22,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
    marginHorizontal: 20,
  },
  label: { fontSize: 13 },
});
