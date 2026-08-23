import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
} from 'react';
import {
  type AccessibilityActionEvent,
  Dimensions,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { NumericStepper, type NumericStepperHandle } from '@/components/NumericStepperView';
import { haptics } from '@/ui/haptics';
import { Icon } from '@/ui/icons';
import { motion } from '@/ui/motion';
import { Text } from '@/ui/Text';
import { useReduceMotion } from '@/ui/useReduceMotion';
import { useTheme, type Theme } from '@/ui/useTheme';

import {
  canCompleteSet,
  exerciseSetStrip,
  ghostSetStrip,
  setValuesLabel,
  type ExerciseShape,
  type SetShape,
} from './activeSet';

/** Live voice state for the inline-morph display. `idle` renders nothing extra. */
export interface VoiceCardState {
  phase: 'idle' | 'listening' | 'pending' | 'applied' | 'error';
  partial?: string;
  feedback?: string;
}

export interface ActiveSetCardHandle {
  /** Commit any open keypad edits and return the effective weight × reps. */
  flushEdits: () => { weight: number | null; reps: number | null };
}

interface Props {
  exercise: ExerciseShape;
  set: SetShape;
  exerciseIndex: number; // 1-based for display
  totalExercises: number;
  setIndex: number; // 1-based for display
  weightStep: number; // 5 (lb) or 2.5 (kg)
  weightUnit: 'LB' | 'KG';
  ghostSets: SetShape[]; // completed sets before this one in the same exercise
  onChangeWeight: (next: number | null) => void;
  onChangeReps: (next: number | null) => void;
  onComplete: (values: { weight: number | null; reps: number | null }) => void;
  /** Tapping a banked ghost set opens the set editor (backlog 1.1). */
  onEditSet?: (set: SetShape, displayIndex: number) => void;
  /** LAST TIME provenance strip for a history-prefilled staged set (spec §2). */
  lastTime?: { weight: number | null; reps: number | null } | null;
  voice?: VoiceCardState;
}

const COMPLETE_ACTION = [{ name: 'activate', label: 'Complete set' }];

const ActiveSetCardBase = forwardRef<ActiveSetCardHandle, Props>(function ActiveSetCard(
  {
    exercise,
    set,
    exerciseIndex,
    totalExercises,
    setIndex,
    weightStep,
    weightUnit,
    ghostSets,
    onChangeWeight,
    onChangeReps,
    onComplete,
    onEditSet,
    lastTime,
    voice,
  },
  ref,
) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const weightRef = useRef<NumericStepperHandle>(null);
  const repsRef = useRef<NumericStepperHandle>(null);

  const flushEdits = useCallback((): { weight: number | null; reps: number | null } => {
    const w = weightRef.current;
    const r = repsRef.current;
    // flushEdit() already returns the effective value (a committed null is a
    // real clear) — fall back to props only when a ref isn't mounted.
    return {
      weight: w ? w.flushEdit() : set.weight,
      reps: r ? r.flushEdit() : set.reps,
    };
  }, [set.weight, set.reps]);

  useImperativeHandle(ref, () => ({ flushEdits }), [flushEdits]);

  const canComplete = canCompleteSet(set);

  const translateY = useSharedValue(0);
  const thresholdCrossed = useSharedValue(false);
  const COMPLETION_THRESHOLD = 60;

  const screenHeight = Dimensions.get('window').height;
  const entryY = useSharedValue(screenHeight);

  // Live reduced motion (impeccable r2 #I3), sourced from the shared hook.
  // The hook caches the last resolved value across every mount app-wide, so
  // once any consumer has resolved it once, a card that remounts on every
  // logged set gets the correct value on this very first render — no
  // per-mount async wait before deciding whether to spring the entry in.
  const reduceMotion = useReduceMotion();
  const reduceMotionSV = useSharedValue(reduceMotion);
  useEffect(() => {
    reduceMotionSV.value = reduceMotion;
  }, [reduceMotion, reduceMotionSV]);

  useEffect(() => {
    entryY.value = reduceMotion ? 0 : withSpring(0, motion.spring.settle);
    // Reset translateY whenever a new set mounts
    translateY.value = 0;
  }, [reduceMotion, set.id, entryY, translateY]);

  const fireThresholdHaptic = useCallback(() => {
    haptics.rigid();
  }, []);

  const handleComplete = useCallback(() => {
    const values = flushEdits();
    if (!canCompleteSet({ reps: values.reps })) {
      // A flushed clear can disarm the gate after the fling — bring the card back.
      translateY.value = withSpring(0, motion.spring.rebound);
      return;
    }
    // Medium = "set banked" — the signature complete-set moment's haptic half.
    haptics.medium();
    onComplete(values);
  }, [flushEdits, onComplete, translateY]);

  // VoiceOver/TalkBack can't perform the swipe — expose completion as an
  // accessibility action so the screen is operable without the gesture (#9.1).
  const onAccessibilityAction = useCallback(
    (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'activate') handleComplete();
    },
    [handleComplete],
  );

  const pan = Gesture.Pan()
    // Up-only activation: a swipe up past 10px activates the log gesture; a
    // swipe down past 10px fails fast and hands the drag to the ScrollView,
    // freeing vertical scroll instead of eating it into a dead completion
    // gesture (impeccable batch 2).
    .activeOffsetY(-10)
    .failOffsetY(10)
    .onUpdate((event) => {
      const ty = event.translationY;
      if (!canComplete) {
        // Gated: a damped tug that says "the gesture exists but is locked",
        // instead of a dead card. Reduce Motion: stay still.
        translateY.value = reduceMotionSV.value ? 0 : Math.max(-24, Math.min(0, ty * 0.2));
        return;
      }
      if (ty < -COMPLETION_THRESHOLD) {
        const excess = -ty - COMPLETION_THRESHOLD;
        translateY.value = -COMPLETION_THRESHOLD - Math.log(1 + excess) * 8;
        if (!thresholdCrossed.value) {
          thresholdCrossed.value = true;
          runOnJS(fireThresholdHaptic)();
        }
      } else {
        translateY.value = Math.min(0, ty);
        thresholdCrossed.value = false;
      }
    })
    .onEnd(() => {
      if (!canComplete) {
        translateY.value = withSpring(0, motion.spring.rebound);
        return;
      }
      if (thresholdCrossed.value) {
        translateY.value = withSpring(-600, motion.spring.snappy);
        thresholdCrossed.value = false;
        runOnJS(handleComplete)();
      } else {
        translateY.value = withSpring(0, motion.spring.rebound);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + entryY.value }],
  }));

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.container, animatedStyle]}
        // accessible: without it the label/actions never form a VoiceOver
        // element and the swipe-alternative action is unreachable (#9.1).
        accessible
        accessibilityLabel={`Set ${setIndex}, ${set.weight ?? 'bodyweight'}${set.weight != null && set.units ? ` ${set.units}` : ''} by ${set.reps ?? 'no reps'} reps. Swipe up to complete.`}
        accessibilityHint="Swipe up to mark this set complete"
        accessibilityActions={canComplete ? COMPLETE_ACTION : undefined}
        onAccessibilityAction={onAccessibilityAction}
      >
        {/* Position line as a mono strip — the metadata treatment, not an eyebrow. */}
        <Text variant="strip" color={theme.color.inkTertiary}>
          {exerciseSetStrip(exerciseIndex, totalExercises, setIndex)}
        </Text>
        <Text variant="title" color={theme.color.inkHero} style={styles.exerciseName}>
          {exercise.exerciseName}
        </Text>

        <View style={styles.heroRow}>
          <NumericStepper
            ref={weightRef}
            value={set.weight}
            step={weightStep}
            unit={weightUnit}
            onChange={onChangeWeight}
            accessoryLabel="NEXT → REPS"
            onAccessoryPress={() => repsRef.current?.openKeypad()}
            size="hero"
            testID="weight-stepper"
          />
          <Text
            // variant="hero" (not the implicit "body" default) purely so
            // Text.tsx injects the same scaledLineHeight('hero', fontScale,
            // 1.2) the two hero-sized NumericSteppers beside it get — this
            // row aligns on `alignItems: 'baseline'`, so the × needs the
            // identical, Dynamic-Type-scaled line box to keep sharing their
            // baseline instead of freezing while its neighbors grow
            // (Round-2 P0 review gap). fontFamily/fontSize/letterSpacing are
            // still hand-reconciled below: the × is deliberately lighter
            // (mono, not monoMedium), smaller (0.7x), and untracked — hero's
            // own -3.5 tracking is tuned for the 82pt numeral run, not a
            // single small glyph.
            variant="hero"
            maxFontSizeMultiplier={1.2}
            style={[
              styles.heroX,
              {
                color: theme.color.inkTertiary,
                fontFamily: theme.font.family.mono,
                fontSize: theme.font.size.hero * 0.7,
                letterSpacing: 0,
              },
            ]}
          >
            ×
          </Text>
          <NumericStepper
            ref={repsRef}
            value={set.reps}
            step={1}
            unit="REPS"
            onChange={onChangeReps}
            accessoryLabel="DONE"
            size="hero"
            testID="reps-stepper"
          />
        </View>

        {lastTime ? (
          <Text variant="strip" color={theme.color.inkTertiary}>
            {`LAST TIME · ${setValuesLabel(lastTime.weight, lastTime.reps)}`}
          </Text>
        ) : null}

        {ghostSets.length > 0 ? (
          <View style={styles.ghostList}>
            {ghostSets.map((g, i) => (
              // Banked sets are mono strips; tapping one opens the set editor
              // (backlog 1.1). Row height ≥44pt keeps the target honest.
              <Pressable
                key={g.id}
                style={styles.ghostRow}
                disabled={!onEditSet}
                onPress={onEditSet ? () => onEditSet(g, i + 1) : undefined}
                accessibilityRole="button"
                accessibilityLabel={`Set ${i + 1}, ${g.weight ?? 'no weight'} by ${g.reps ?? 'no reps'} reps, completed`}
                accessibilityHint={onEditSet ? 'Opens the set editor' : undefined}
              >
                <Text variant="strip" color={theme.color.inkTertiary}>
                  {ghostSetStrip(i + 1, g)}
                </Text>
                <Icon name="check" size={14} color={theme.color.inkTertiary} />
              </Pressable>
            ))}
          </View>
        ) : null}

        {voice && voice.phase !== 'idle' ? (
          <View style={styles.voiceRow}>
            <Text
              variant="meta"
              color={
                voice.phase === 'error'
                  ? theme.color.danger
                  : voice.phase === 'applied'
                    ? theme.color.ink
                    : theme.color.inkSecondary
              }
              style={styles.voiceText}
            >
              {voice.phase === 'listening'
                ? voice.partial
                  ? `“${voice.partial}”`
                  : 'Listening…'
                : voice.phase === 'pending'
                  ? `Heard ${voice.feedback ?? ''}. Say “yes” to confirm`
                  : voice.phase === 'error'
                    ? (voice.feedback ?? 'Didn’t catch that')
                    : `✓ ${voice.feedback ?? ''}`}
            </Text>
          </View>
        ) : null}

        <View style={styles.swipeHintRow}>
          {/* Signature interaction — must not be the faintest text on the
              card, so inkSecondary rather than inkTertiary (impeccable batch 2). */}
          <Text variant="meta" color={theme.color.inkSecondary}>
            {canComplete ? '↑ Swipe up to log' : 'Enter reps to log this set'}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
});

// Memoized: this card owns the swipe gesture + numeric steppers, so it's the
// most expensive leaf under WorkoutActiveScreen. With the rest-tick isolated
// to RestProgressBar (Batch 2 P1), a stable-props render of this card should
// be a no-op — memo() is what makes that actually skip work.
export const ActiveSetCard = memo(ActiveSetCardBase);
ActiveSetCard.displayName = 'ActiveSetCard';

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: theme.space.s5,
      paddingTop: theme.space.s6,
      paddingBottom: theme.space.s2,
      gap: theme.space.half,
      marginHorizontal: theme.space.s4,
      marginTop: theme.space.s3,
      // Panel materiality: flat surface + 1.5px hairline (slab depth retired).
      borderWidth: theme.depth.hairline,
      backgroundColor: theme.color.surface,
      borderColor: theme.color.border,
    },
    exerciseName: { marginBottom: theme.space.s4 },
    heroRow: {
      flexDirection: 'row',
      alignItems: 'baseline',
      paddingVertical: theme.space.s2,
    },
    heroX: {
      paddingHorizontal: theme.space.s1,
      opacity: 0.4,
    },
    ghostList: {
      marginTop: theme.space.s4,
      paddingTop: theme.space.s2,
      borderTopWidth: theme.depth.hairline,
      borderTopColor: theme.color.border,
    },
    ghostRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      minHeight: theme.touch.min,
    },
    swipeHintRow: { marginTop: theme.space.s6, alignItems: 'center' },
    voiceRow: { marginTop: theme.space.s4, alignItems: 'center' },
    voiceText: { fontStyle: 'italic' },
  });
