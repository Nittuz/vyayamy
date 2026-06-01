import { useCallback, useEffect, useState } from 'react';
import { Dimensions, Pressable, StyleSheet, Text, View } from 'react-native';
import { GestureDetector, Gesture } from 'react-native-gesture-handler';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
} from 'react-native-reanimated';

import { NumericStepper } from '@/components/NumericStepperView';
import { haptics } from '@/ui/haptics';
import { motion } from '@/ui/motion';
import { useTheme } from '@/ui/useTheme';

import type { ExerciseShape, SetShape } from './activeSet';

/** Live voice state for the inline-morph display. `idle` renders nothing extra. */
export interface VoiceCardState {
  phase: 'idle' | 'listening' | 'pending' | 'applied';
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

  const fireCompletion = useCallback(() => {
    handleComplete();
  }, [handleComplete]);

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
        runOnJS(fireCompletion)();
      } else {
        translateY.value = withSpring(0, motion.spring.rebound);
      }
    });

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value + entryY.value }],
  }));

  const labelStyle = [
    styles.label,
    { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
  ];

  return (
    <GestureDetector gesture={pan}>
      <Animated.View
        style={[styles.container, animatedStyle]}
        accessibilityLabel={`Set ${setIndex}, ${set.weight ?? 'no weight'} by ${set.reps ?? 'no reps'} reps. Swipe up to complete.`}
        accessibilityHint="Swipe up to mark this set complete"
      >
        <Text style={labelStyle}>EXERCISE {exerciseIndex} OF {totalExercises}</Text>
        <Text
          style={[
            styles.exerciseName,
            {
              color: theme.color.inkHero,
              fontFamily: theme.font.family.sansSemibold,
              fontSize: theme.font.size.title,
              letterSpacing: theme.font.tracking.title,
            },
          ]}
        >
          {exercise.exerciseName}
        </Text>

        <Text style={labelStyle}>SET {setIndex}</Text>

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
          <>
            <View style={[styles.divider, { borderTopColor: theme.color.border }]} />
            <View style={styles.ghostList}>
              {ghostSets.map((g, i) => (
                <View
                  key={g.id}
                  style={styles.ghostRow}
                  accessibilityLabel={`Set ${i + 1}, ${g.weight ?? 'no weight'} by ${g.reps ?? 'no reps'} reps, completed`}
                >
                  <View style={styles.ghostLeft}>
                    <Text
                      style={[
                        styles.ghostLabel,
                        { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
                      ]}
                    >
                      SET {i + 1}
                    </Text>
                    <Text
                      style={[
                        styles.ghostValue,
                        { color: theme.color.inkSecondary, fontFamily: theme.font.family.mono },
                      ]}
                    >
                      {g.weight ?? '–'} × {g.reps ?? '–'}
                    </Text>
                  </View>
                  <Text style={[styles.ghostCheck, { color: theme.color.accent }]}>✓</Text>
                </View>
              ))}
            </View>
          </>
        ) : null}

        {voice && voice.phase !== 'idle' ? (
          <View style={styles.voiceRow}>
            <Text
              style={[
                styles.voiceText,
                {
                  color: voice.phase === 'applied' ? theme.color.accent : theme.color.inkSecondary,
                  fontFamily: theme.font.family.sansMedium,
                },
              ]}
            >
              {voice.phase === 'listening'
                ? voice.partial
                  ? `“${voice.partial}”`
                  : 'Listening…'
                : voice.phase === 'pending'
                  ? `Heard ${voice.feedback ?? ''} — say “yes” to confirm`
                  : `✓ ${voice.feedback ?? ''}`}
            </Text>
          </View>
        ) : null}

        <View style={styles.swipeHintRow}>
          <Text
            style={[
              styles.swipeHint,
              { color: theme.color.inkTertiary, fontFamily: theme.font.family.sans },
            ]}
          >
            {canComplete ? '↑ Swipe up to complete' : 'Set weight and reps to continue'}
          </Text>
        </View>
      </Animated.View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  container: { paddingHorizontal: 20, paddingTop: 24, gap: 6 },
  label: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    paddingTop: 8,
  },
  exerciseName: { marginBottom: 18 },
  heroRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    paddingVertical: 8,
  },
  heroX: {
    paddingHorizontal: 6,
    opacity: 0.4,
  },
  divider: {
    borderTopWidth: StyleSheet.hairlineWidth,
    marginVertical: 18,
  },
  ghostList: { gap: 8 },
  ghostRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  ghostLeft: { flexDirection: 'row', alignItems: 'baseline', gap: 12 },
  ghostLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
  },
  ghostValue: {
    fontSize: 13,
  },
  ghostCheck: {
    fontSize: 14,
  },
  swipeHintRow: { marginTop: 28, alignItems: 'center' },
  swipeHint: { fontSize: 13 },
  voiceRow: { marginTop: 16, alignItems: 'center' },
  voiceText: { fontSize: 13, fontStyle: 'italic' },
});
