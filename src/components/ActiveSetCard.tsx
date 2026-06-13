import { useCallback, useEffect, useMemo, useState } from 'react';
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

import { NumericStepper } from '@/components/NumericStepperView';
import { haptics } from '@/ui/haptics';
import { Icon } from '@/ui/icons';
import { motion } from '@/ui/motion';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

import type { ExerciseShape, SetShape } from './activeSet';

/** Live voice state for the inline-morph display. `idle` renders nothing extra. */
export interface VoiceCardState {
  phase: 'idle' | 'listening' | 'pending' | 'applied' | 'error';
  partial?: string;
  feedback?: string;
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
  onComplete: () => void;
  voice?: VoiceCardState;
}

type FocusedField = 'weight' | 'reps' | null;

const COMPLETE_ACTION = [{ name: 'activate', label: 'Complete set' }];

export function ActiveSetCard({
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
  voice,
}: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [focused, setFocused] = useState<FocusedField>(null);

  const canComplete = set.weight != null && set.reps != null;

  const translateY = useSharedValue(0);
  const thresholdCrossed = useSharedValue(false);
  const COMPLETION_THRESHOLD = 60;

  const screenHeight = Dimensions.get('window').height;
  const entryY = useSharedValue(screenHeight);

  useEffect(() => {
    entryY.value = withSpring(0, motion.spring.settle);
    // Reset translateY whenever a new set mounts
    translateY.value = 0;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [set.id]);

  const fireThresholdHaptic = useCallback(() => {
    haptics.rigid();
  }, []);

  const handleComplete = useCallback(() => {
    if (!canComplete) return;
    // Medium = "set banked" — the signature complete-set moment's haptic half.
    haptics.medium();
    onComplete();
  }, [canComplete, onComplete]);

  // VoiceOver/TalkBack can't perform the swipe — expose completion as an
  // accessibility action so the screen is operable without the gesture (#9.1).
  const onAccessibilityAction = useCallback(
    (e: AccessibilityActionEvent) => {
      if (e.nativeEvent.actionName === 'activate') handleComplete();
    },
    [handleComplete],
  );

  const pan = Gesture.Pan()
    .activeOffsetY([-10, 10])
    .onUpdate((event) => {
      if (!canComplete) return;
      const ty = event.translationY;
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
        accessibilityLabel={`Set ${setIndex}, ${set.weight ?? 'no weight'} by ${set.reps ?? 'no reps'} reps. Swipe up to complete.`}
        accessibilityHint="Swipe up to mark this set complete"
        accessibilityActions={canComplete ? COMPLETE_ACTION : undefined}
        onAccessibilityAction={onAccessibilityAction}
      >
        <Text variant="label" color={theme.color.inkTertiary}>
          Exercise {exerciseIndex} of {totalExercises}
        </Text>
        <Text variant="title" color={theme.color.inkHero} style={styles.exerciseName}>
          {exercise.exerciseName}
        </Text>

        <Text variant="label" color={theme.color.inkTertiary}>
          Set {setIndex}
        </Text>

        <Pressable
          onPress={() => setFocused(null)} // tap empty area clears focus
          style={styles.heroRow}
        >
          <NumericStepper
            value={set.weight}
            step={weightStep}
            unit={weightUnit}
            focused={focused === 'weight'}
            onFocus={() => setFocused('weight')}
            onBlur={() => setFocused(null)}
            onChange={onChangeWeight}
            size="hero"
            testID="weight-stepper"
          />
          <Text
            style={[
              styles.heroX,
              {
                color: theme.color.inkTertiary,
                fontFamily: theme.font.family.mono,
                fontSize: theme.font.size.hero * 0.7,
                lineHeight: theme.font.size.hero * theme.font.lineHeightMul.hero,
              },
            ]}
          >
            ×
          </Text>
          <NumericStepper
            value={set.reps}
            step={1}
            unit="REPS"
            focused={focused === 'reps'}
            onFocus={() => setFocused('reps')}
            onBlur={() => setFocused(null)}
            onChange={onChangeReps}
            size="hero"
            testID="reps-stepper"
          />
        </Pressable>

        {ghostSets.length > 0 ? (
          <View style={styles.ghostList}>
            {ghostSets.map((g, i) => (
              <View
                key={g.id}
                style={styles.ghostRow}
                accessibilityLabel={`Set ${i + 1}, ${g.weight ?? 'no weight'} by ${g.reps ?? 'no reps'} reps, completed`}
              >
                <View style={styles.ghostLeft}>
                  <Text variant="label" color={theme.color.inkTertiary}>
                    Set {i + 1}
                  </Text>
                  <Text variant="numeral" color={theme.color.inkSecondary}>
                    {g.weight ?? '–'} × {g.reps ?? '–'}
                  </Text>
                </View>
                <Icon name="check" size={16} color={theme.color.accent} />
              </View>
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
                    ? theme.color.accent
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
          <Text variant="meta" color={theme.color.inkTertiary}>
            {canComplete ? '↑ Swipe up to complete' : 'Set weight and reps to continue'}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: {
      paddingHorizontal: theme.space.s5,
      paddingTop: theme.space.s6,
      paddingBottom: theme.space.s2,
      gap: theme.space.half,
      marginHorizontal: theme.space.s4,
      marginTop: theme.space.s3,
      borderRadius: theme.radius.card,
      borderWidth: theme.depth.rule,
      backgroundColor: theme.color.surface2,
      borderColor: theme.color.borderStrong,
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
      gap: theme.space.s2,
      marginTop: theme.space.s4,
      paddingTop: theme.space.s4,
      borderTopWidth: theme.depth.rule,
      borderTopColor: theme.color.border,
    },
    ghostRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    ghostLeft: { flexDirection: 'row', alignItems: 'baseline', gap: theme.space.s3 },
    swipeHintRow: { marginTop: theme.space.s6, alignItems: 'center' },
    voiceRow: { marginTop: theme.space.s4, alignItems: 'center' },
    voiceText: { fontStyle: 'italic' },
  });
