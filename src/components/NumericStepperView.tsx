import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  InputAccessoryView,
  Keyboard,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { haptics } from '@/ui/haptics';
import { Icon } from '@/ui/icons';
import { PRESS_DIP_OPACITY } from '@/ui/plateStyles';
import { Text } from '@/ui/Text';
import { resolveMaxFontSizeMultiplier, resolveTextStyle } from '@/ui/textVariants';
import { useTheme, type Theme } from '@/ui/useTheme';

import {
  applyStep,
  beginEditSession,
  type EditSession,
  formatValue,
  resolveEditCommit,
  sanitizeNumber,
} from './numericStepper';

const RAMP_DELAY_MS = 600;
const RAMP_INTERVAL_MS = 200;

export interface NumericStepperHandle {
  /**
   * Commit any open keypad edit NOW (flush-before-consume, spec §1/§3) and
   * return the effective value: the just-committed value, or the current prop
   * value when no edit was open / the edit was a no-op. Idempotent — a later
   * blur finds no session and does nothing.
   */
  flushEdit: () => number | null;
  /** Open the keypad on this field (the accessory bar's NEXT hand-off). */
  openKeypad: () => void;
}

interface Props {
  value: number | null;
  step: number; // 5 (lb) or 2.5 (kg) for weight; 1 for reps
  unit: string; // 'LB' | 'KG' | 'REPS'
  onChange: (next: number | null) => void;
  /** iOS keyboard-accessory action: NEXT (weight → reps) or DONE (dismiss). */
  accessoryLabel: string;
  onAccessoryPress?: () => void;
  size?: 'hero' | 'inline';
  testID?: string;
}

export const NumericStepper = forwardRef<NumericStepperHandle, Props>(function NumericStepper(
  { value, step, unit, onChange, accessoryLabel, onAccessoryPress, size = 'hero', testID },
  ref,
) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  // Reps are whole numbers capped at 200; weight keeps decimals capped at 1500.
  // Sanitizing here is the single choke point for keypad AND steppers (#19).
  const isReps = unit === 'REPS';
  const sanitize = useCallback(
    (n: number) => sanitizeNumber(n, { min: 0, max: isReps ? 200 : 1500, integer: isReps }),
    [isReps],
  );

  // Session state drives the TextInput; the ref gives flushEdit synchronous
  // access (imperative callers can't wait a render).
  const [session, setSession] = useState<EditSession | null>(null);
  const sessionRef = useRef<EditSession | null>(null);
  const valueRef = useRef(value);
  // Render-time ref mirror — deliberate: flushEdit() must read the latest
  // committed value synchronously in the same tick (an effect would lag).
  valueRef.current = value;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const commitSession = useCallback((): number | null => {
    const s = sessionRef.current;
    if (!s) return valueRef.current;
    sessionRef.current = null;
    setSession(null);
    const res = resolveEditCommit(s, sanitize);
    if (res.kind === 'commit') {
      onChangeRef.current(res.value);
      return res.value;
    }
    return valueRef.current;
  }, [sanitize]);

  const openKeypad = useCallback(() => {
    const s = beginEditSession(valueRef.current);
    sessionRef.current = s;
    setSession(s);
  }, []);

  useImperativeHandle(ref, () => ({ flushEdit: commitSession, openKeypad }), [
    commitSession,
    openKeypad,
  ]);

  // ——— stepper ± with the #14 ramp (accumulate from a ref; stop at bounds) ———
  const rampTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const rampIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const rampAccRef = useRef<number | null>(null);

  const handleStep = useCallback(
    (direction: 1 | -1) => {
      haptics.light();
      onChange(sanitize(applyStep(valueRef.current, step, direction)));
    },
    [step, onChange, sanitize],
  );

  const startRamp = useCallback(
    (direction: 1 | -1) => {
      haptics.light();
      const first = sanitize(applyStep(valueRef.current, step, direction));
      rampAccRef.current = first;
      onChange(first);
      rampTimerRef.current = setTimeout(() => {
        rampIntervalRef.current = setInterval(() => {
          const prev = rampAccRef.current ?? valueRef.current ?? 0;
          const next = sanitize(applyStep(prev, step, direction));
          if (next === prev) return; // hit a bound — don't spam onChange/haptics
          rampAccRef.current = next;
          haptics.light();
          onChange(next);
        }, RAMP_INTERVAL_MS);
      }, RAMP_DELAY_MS);
    },
    [step, onChange, sanitize],
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

  const editing = session != null;
  const numeralVariant = size === 'hero' ? ('hero' as const) : ('numeralLg' as const);
  const numeralStyle = resolveTextStyle(numeralVariant);
  const accessoryID = `${testID ?? unit}-accessory`;

  const onDone = useCallback(() => {
    commitSession();
    if (onAccessoryPress) onAccessoryPress();
    else Keyboard.dismiss();
  }, [commitSession, onAccessoryPress]);

  return (
    <View style={size === 'hero' ? styles.containerHero : styles.containerInline} testID={testID}>
      <View style={styles.numeralRow}>
        {editing ? (
          <>
            <TextInput
              value={session.text}
              onChangeText={(text) => {
                const current = sessionRef.current;
                if (!current) return;
                const next = { ...current, text };
                sessionRef.current = next;
                setSession(next);
              }}
              onBlur={commitSession}
              onSubmitEditing={onDone}
              autoFocus
              selectTextOnFocus
              // Weight always takes decimals — lb plates come in 2.5s even
              // though the lb step is 5 (spec §1; NOT derived from the step).
              keyboardType={isReps ? 'number-pad' : 'decimal-pad'}
              inputAccessoryViewID={Platform.OS === 'ios' ? accessoryID : undefined}
              accessibilityLabel={`${unit} input`}
              placeholder="0"
              placeholderTextColor={theme.color.inkTertiary}
              maxFontSizeMultiplier={resolveMaxFontSizeMultiplier(numeralVariant) ?? 1.2}
              style={[
                numeralStyle,
                styles.numeral,
                // 0.62 ≈ one tabular digit's width/em in GeistMono; 82 = hero fallback.
                { color: theme.color.inkHero, minWidth: (numeralStyle.fontSize ?? 82) * 0.62 },
              ]}
            />
            {Platform.OS === 'ios' ? (
              <InputAccessoryView nativeID={accessoryID}>
                <View
                  style={[
                    styles.accessoryBar,
                    { backgroundColor: theme.color.surface, borderTopColor: theme.color.border },
                  ]}
                >
                  <Pressable
                    onPress={onDone}
                    hitSlop={8}
                    accessibilityRole="button"
                    accessibilityLabel={accessoryLabel}
                    style={({ pressed }) => [
                      styles.accessoryKey,
                      pressed && { opacity: PRESS_DIP_OPACITY },
                    ]}
                  >
                    <Text variant="label" color={theme.color.ink}>
                      {accessoryLabel}
                    </Text>
                  </Pressable>
                </View>
              </InputAccessoryView>
            ) : null}
          </>
        ) : (
          <Pressable
            onPress={openKeypad}
            accessibilityRole="button"
            accessibilityLabel={
              value == null
                ? `${unit}: empty. Tap to enter.`
                : `${unit}: ${formatValue(value)}. Tap to edit.`
            }
            style={({ pressed }) => [pressed && { opacity: PRESS_DIP_OPACITY }]}
          >
            {value == null ? (
              // Never a bare '-': ghosted 0 over a rule marks the input slot
              // (spec §2). '-' stays read-only-metadata-only.
              <Text
                variant={numeralVariant}
                color={theme.color.inkTertiary}
                style={[
                  styles.numeral,
                  styles.emptyUnderline,
                  { borderBottomColor: theme.color.borderStrong },
                ]}
              >
                0
              </Text>
            ) : (
              <Text variant={numeralVariant} color={theme.color.inkHero} style={styles.numeral}>
                {formatValue(value)}
              </Text>
            )}
          </Pressable>
        )}
        {size === 'hero' ? (
          // Always visible at hero size — never focus-dependent (1.10/#136).
          <Text variant="strip" color={theme.color.inkTertiary} style={styles.unit}>
            {unit}
          </Text>
        ) : null}
      </View>
      {/* Always-visible ± at ≥44pt (closes 9.3/#27) — hidden only while the
          keypad is open so nothing can step a value the user can't see. */}
      {!editing ? (
        <View style={styles.stepRow}>
          <Pressable
            onPress={() => handleStep(-1)}
            onLongPress={() => startRamp(-1)}
            onPressOut={stopRamp}
            accessibilityRole="button"
            accessibilityLabel={`Decrease ${unit.toLowerCase()} by ${step}`}
            style={({ pressed }) => [
              styles.stepKey,
              {
                borderColor: theme.color.border,
                minWidth: theme.touch.min,
                minHeight: theme.touch.min,
              },
              pressed && { opacity: PRESS_DIP_OPACITY },
            ]}
          >
            <Icon name="minus" size={18} color={theme.color.ink} />
          </Pressable>
          <Pressable
            onPress={() => handleStep(1)}
            onLongPress={() => startRamp(1)}
            onPressOut={stopRamp}
            accessibilityRole="button"
            accessibilityLabel={`Increase ${unit.toLowerCase()} by ${step}`}
            style={({ pressed }) => [
              styles.stepKey,
              {
                borderColor: theme.color.border,
                minWidth: theme.touch.min,
                minHeight: theme.touch.min,
              },
              pressed && { opacity: PRESS_DIP_OPACITY },
            ]}
          >
            <Icon name="plus" size={18} color={theme.color.ink} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    containerHero: { gap: theme.space.s3 },
    containerInline: { flexDirection: 'row', alignItems: 'center', gap: theme.space.s3 },
    numeralRow: { flexDirection: 'row', alignItems: 'baseline', gap: theme.space.s2 },
    numeral: { fontVariant: ['tabular-nums'], paddingHorizontal: 0 },
    emptyUnderline: { borderBottomWidth: theme.depth.rule },
    unit: { marginLeft: theme.space.s1 },
    stepRow: { flexDirection: 'row', gap: theme.space.s2 },
    stepKey: {
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: theme.depth.hairline,
    },
    accessoryBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      borderTopWidth: theme.depth.hairline,
      paddingHorizontal: theme.space.s4,
      paddingVertical: theme.space.s2,
    },
    accessoryKey: {
      minHeight: theme.touch.min,
      justifyContent: 'center',
      paddingHorizontal: theme.space.s3,
    },
  });
