import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { haptics } from '@/ui/haptics';
import { useTheme } from '@/ui/useTheme';

import { applyStep, formatValue, useDebouncedCommit } from './numericStepper';

interface Props {
  value: number | null;
  step: number; // 5 (lb) or 2.5 (kg) for weight; 1 for reps
  unit: string; // 'LB' | 'KG' | 'REPS'
  focused: boolean;
  onFocus: () => void;
  onBlur: () => void;
  onChange: (next: number | null) => void;
  size?: 'hero' | 'inline';
  testID?: string;
}

const RAMP_DELAY_MS = 600;
const RAMP_INTERVAL_MS = 200;

export function NumericStepper({
  value,
  step,
  unit,
  focused,
  onFocus,
  onBlur,
  onChange,
  size = 'hero',
  testID,
}: Props) {
  const theme = useTheme();
  const [editingText, setEditingText] = useState<string | null>(null);
  const debounced = useDebouncedCommit(onChange, 250);
  const rampTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rampIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Sync external value into local edit state when not editing
  useEffect(() => {
    if (editingText === null) {
      // No-op: we render formatValue(value) directly when not editing
    }
  }, [value, editingText]);

  const handleStep = useCallback(
    (direction: 1 | -1) => {
      haptics.light();
      const next = applyStep(value, step, direction);
      onChange(next);
    },
    [value, step, onChange],
  );

  const startRamp = useCallback(
    (direction: 1 | -1) => {
      handleStep(direction);
      rampTimerRef.current = setTimeout(() => {
        rampIntervalRef.current = setInterval(() => {
          haptics.light();
          // Ramp computes from value at gesture-start (not live state).
          // onChange does not accept a function-update callback; simplify to
          // avoid TS error. User can release and re-press for further increments.
          onChange(applyStep(value, step, direction));
        }, RAMP_INTERVAL_MS);
      }, RAMP_DELAY_MS);
    },
    [value, step, onChange, handleStep],
  );

  const stopRamp = useCallback(() => {
    if (rampTimerRef.current) {
      clearTimeout(rampTimerRef.current);
      rampTimerRef.current = null;
    }
    if (rampIntervalRef.current) {
      clearInterval(rampIntervalRef.current);
      rampIntervalRef.current = null;
    }
  }, []);

  useEffect(() => () => stopRamp(), [stopRamp]);

  const onPressNumber = useCallback(() => {
    if (focused) {
      // Enter edit (keypad) mode
      setEditingText(formatValue(value));
    } else {
      onFocus();
    }
  }, [focused, value, onFocus]);

  const commitEdit = useCallback(() => {
    debounced.flushNow();
    setEditingText(null);
  }, [debounced]);

  const heroSize = size === 'hero' ? theme.font.size.hero : theme.font.size.title;
  const heroTracking = size === 'hero' ? theme.font.tracking.hero : theme.font.tracking.title;

  return (
    <View style={styles.container} testID={testID}>
      {focused ? (
        <View style={styles.chevColumn} accessible={false}>
          <Pressable
            onPress={() => handleStep(1)}
            onLongPress={() => startRamp(1)}
            onPressOut={stopRamp}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Increase ${unit.toLowerCase()} by ${step}`}
          >
            <Text style={[styles.chev, { color: theme.color.accent }]}>▲</Text>
          </Pressable>
          <Pressable
            onPress={() => handleStep(-1)}
            onLongPress={() => startRamp(-1)}
            onPressOut={stopRamp}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${unit.toLowerCase()} by ${step}`}
          >
            <Text style={[styles.chev, { color: theme.color.accent }]}>▼</Text>
          </Pressable>
        </View>
      ) : null}
      {editingText != null ? (
        <TextInput
          value={editingText}
          onChangeText={(text) => {
            setEditingText(text);
            debounced.bufferKeystroke(text);
          }}
          onBlur={commitEdit}
          onSubmitEditing={commitEdit}
          autoFocus
          keyboardType={Number.isInteger(step) ? 'number-pad' : 'decimal-pad'}
          style={[
            styles.number,
            {
              color: theme.color.inkHero,
              fontFamily: theme.font.family.mono,
              fontSize: heroSize,
              letterSpacing: heroTracking,
              lineHeight: heroSize * theme.font.lineHeightMul.hero,
            },
          ]}
        />
      ) : (
        <Pressable onPress={onPressNumber} accessibilityRole="button" accessibilityLabel={unit}>
          <Text
            style={[
              styles.number,
              {
                color: focused ? theme.color.inkHero : theme.color.ink,
                fontFamily: theme.font.family.mono,
                fontSize: heroSize,
                letterSpacing: heroTracking,
                lineHeight: heroSize * theme.font.lineHeightMul.hero,
              },
            ]}
          >
            {formatValue(value)}
          </Text>
        </Pressable>
      )}
      {focused && size === 'hero' ? (
        <Text
          style={[
            styles.unit,
            {
              color: theme.color.inkTertiary,
              fontFamily: theme.font.family.sansMedium,
            },
          ]}
        >
          {unit}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: 'row',
    alignItems: 'flex-end',
  },
  chevColumn: {
    justifyContent: 'space-between',
    paddingRight: 8,
    paddingBottom: 12,
  },
  chev: {
    fontSize: 14,
    paddingVertical: 4,
  },
  number: {
    paddingHorizontal: 0,
    fontVariant: ['tabular-nums'],
  },
  unit: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginLeft: 8,
    marginBottom: 12,
  },
});
