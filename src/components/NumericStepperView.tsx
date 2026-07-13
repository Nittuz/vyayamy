import { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { haptics } from '@/ui/haptics';
import { useTheme } from '@/ui/useTheme';

import { applyStep, formatValue, sanitizeNumber, useDebouncedCommit } from './numericStepper';

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
  // Reps are whole numbers capped at 200; weight keeps decimals capped at 1500.
  // Sanitizing here is the single choke point for both the keypad and the
  // steppers, so no out-of-range value reaches SQLite + sync (#19).
  const isReps = unit === 'REPS';
  const sanitize = useCallback(
    (n: number) => sanitizeNumber(n, { min: 0, max: isReps ? 200 : 1500, integer: isReps }),
    [isReps],
  );
  const debounced = useDebouncedCommit(onChange, 250, sanitize);
  const rampTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rampIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rampAccRef = useRef<number | null>(null);

  // Sync external value into local edit state when not editing
  useEffect(() => {
    if (editingText === null) {
      // No-op: we render formatValue(value) directly when not editing
    }
  }, [value, editingText]);

  const handleStep = useCallback(
    (direction: 1 | -1) => {
      haptics.light();
      onChange(sanitize(applyStep(value, step, direction)));
    },
    [value, step, onChange, sanitize],
  );

  const startRamp = useCallback(
    (direction: 1 | -1) => {
      // Accumulate from a ref so each tick actually advances the value (#14).
      // Previously every tick recomputed from the gesture-start value, so the
      // number moved once while haptics + a duplicate onChange fired each tick.
      haptics.light();
      const first = sanitize(applyStep(value, step, direction));
      rampAccRef.current = first;
      onChange(first);
      rampTimerRef.current = setTimeout(() => {
        rampIntervalRef.current = setInterval(() => {
          const prev = rampAccRef.current ?? value ?? 0;
          const next = sanitize(applyStep(prev, step, direction));
          if (next === prev) return; // hit a bound — don't spam onChange/haptics
          rampAccRef.current = next;
          haptics.light();
          onChange(next);
        }, RAMP_INTERVAL_MS);
      }, RAMP_DELAY_MS);
    },
    [value, step, onChange, sanitize],
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
    if (focused || value == null) {
      // Enter edit (keypad) mode. An empty field goes straight to the keypad
      // on the FIRST tap — there is nothing to nudge with the steppers yet,
      // and hiding typing behind a second tap was the number-entry trap.
      if (!focused) onFocus();
      setEditingText(value == null ? '' : formatValue(value));
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
            <Text style={[styles.chev, { color: theme.color.ink }]}>▲</Text>
          </Pressable>
          <Pressable
            onPress={() => handleStep(-1)}
            onLongPress={() => startRamp(-1)}
            onPressOut={stopRamp}
            hitSlop={12}
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${unit.toLowerCase()} by ${step}`}
          >
            <Text style={[styles.chev, { color: theme.color.ink }]}>▼</Text>
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
          accessibilityLabel={`${unit} input`}
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
        <Pressable
          onPress={onPressNumber}
          accessibilityRole="button"
          accessibilityLabel={`${unit}: ${formatValue(value)}. Tap to edit.`}
        >
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
      {size === 'hero' ? (
        // Always visible at hero size — the unit must never depend on focus
        // (backlog 1.10 / #136). Mono metadata treatment, not an eyebrow.
        <Text
          style={[
            styles.unit,
            {
              color: theme.color.inkTertiary,
              fontFamily: theme.font.family.mono,
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
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginLeft: 8,
    marginBottom: 12,
  },
});
