/**
 * Sheet — the one modal surface. Replaces five divergent hand-rolled modals.
 *
 * `bottom` slides a panel up from the bottom edge (handle + heavy top rule);
 * `center` presents a Plate card for decisions. The presence machine in
 * sheetPresence.ts keeps the Modal mounted through the exit animation —
 * the dead-exit bug all the legacy sheets shipped with. Reduce Motion makes
 * show/hide instant. Callers own scrolling inside `children`; `footer` is the
 * pinned action row.
 */
import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react';
import {
  AccessibilityInfo,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  View,
} from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';

import { resolvePlateStyles } from './plateStyles';
import {
  isMounted,
  nextPhase,
  progressTarget,
  type SheetEvent,
  type SheetPhase,
} from './sheetPresence';
import { Text } from './Text';
import { useTheme, type Theme } from './useTheme';

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  title?: string;
  variant?: 'bottom' | 'center';
  /** false = blocking modal: no backdrop dismiss, no hardware back. */
  dismissable?: boolean;
  maxHeightPct?: number;
  footer?: React.ReactNode;
  children: React.ReactNode;
}

export function Sheet({
  visible,
  onClose,
  title,
  variant = 'bottom',
  dismissable = true,
  maxHeightPct = 0.8,
  footer,
  children,
}: SheetProps) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let active = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => {
        if (active) setReduceMotion(r);
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, []);

  const reduceMotionRef = useRef(reduceMotion);
  reduceMotionRef.current = reduceMotion;

  const [phase, dispatch] = useReducer(
    (p: SheetPhase, e: SheetEvent) => nextPhase(p, e, reduceMotionRef.current),
    'idle',
  );

  useEffect(() => {
    dispatch(visible ? 'show' : 'hide');
  }, [visible]);

  const progress = useSharedValue(0);
  const onEnterDone = useCallback(() => dispatch('enterDone'), []);
  const onExitDone = useCallback(() => dispatch('exitDone'), []);

  useEffect(() => {
    const target = progressTarget(phase);
    if (phase === 'entering') {
      progress.value = withSpring(target, theme.motion.spring.settle, (finished) => {
        if (finished) runOnJS(onEnterDone)();
      });
    } else if (phase === 'exiting') {
      progress.value = withTiming(target, { duration: theme.motion.duration.base }, (finished) => {
        if (finished) runOnJS(onExitDone)();
      });
    } else {
      progress.value = target;
    }
  }, [phase, progress, theme, onEnterDone, onExitDone]);

  const backdropStyle = useAnimatedStyle(() => ({ opacity: progress.value }));
  const panelStyle = useAnimatedStyle(() => ({
    opacity: progress.value,
    transform: [{ translateY: (1 - progress.value) * (variant === 'bottom' ? 48 : 16) }],
  }));

  const centerPlate = useMemo(
    () =>
      resolvePlateStyles(theme, { offset: 'md', tone: 'surface', border: 'strong', radius: 'lg' }),
    [theme],
  );

  if (!isMounted(phase)) return null;

  const handleRequestClose = dismissable ? onClose : noop;

  const header = title ? (
    <View style={styles.header}>
      <Text variant="title" color={theme.color.inkHero}>
        {title}
      </Text>
      <View style={styles.headerRule} />
    </View>
  ) : null;

  const body = (
    <>
      {header}
      <View style={styles.content}>{children}</View>
      {footer ? <View style={styles.footer}>{footer}</View> : null}
    </>
  );

  return (
    <Modal
      visible
      transparent
      animationType="none"
      onRequestClose={handleRequestClose}
      statusBarTranslucent
    >
      <Animated.View style={[styles.backdrop, backdropStyle]}>
        <Pressable
          style={StyleSheet.absoluteFill}
          onPress={handleRequestClose}
          accessibilityRole="button"
          accessibilityLabel="Close"
          disabled={!dismissable}
        />
      </Animated.View>
      {variant === 'bottom' ? (
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.bottomHost}
          pointerEvents="box-none"
        >
          <Animated.View
            style={[
              styles.bottomPanel,
              { maxHeight: `${Math.round(maxHeightPct * 100)}%` },
              panelStyle,
            ]}
          >
            <View style={styles.handle} />
            {body}
          </Animated.View>
        </KeyboardAvoidingView>
      ) : (
        <View style={styles.centerHost} pointerEvents="box-none">
          <Animated.View
            style={[
              centerPlate.container,
              styles.centerContainer,
              { maxHeight: `${Math.round(maxHeightPct * 100)}%` },
              panelStyle,
            ]}
          >
            {centerPlate.slab ? <View pointerEvents="none" style={centerPlate.slab} /> : null}
            <View style={[centerPlate.face, styles.centerFace]}>{body}</View>
          </Animated.View>
        </View>
      )}
    </Modal>
  );
}

function noop() {}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    backdrop: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: theme.color.overlay,
    },
    bottomHost: { flex: 1, justifyContent: 'flex-end' },
    bottomPanel: {
      backgroundColor: theme.color.surface,
      borderTopLeftRadius: theme.radius.lg,
      borderTopRightRadius: theme.radius.lg,
      borderTopWidth: theme.depth.ruleHeavy,
      borderTopColor: theme.color.borderStrong,
      paddingHorizontal: theme.space.page,
      paddingBottom: theme.space.s8,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 4,
      backgroundColor: theme.color.borderStrong,
      marginTop: theme.space.s3,
      marginBottom: theme.space.s2,
    },
    centerHost: {
      flex: 1,
      justifyContent: 'center',
      paddingHorizontal: theme.space.s4,
    },
    centerContainer: { alignSelf: 'stretch' },
    centerFace: {
      paddingHorizontal: theme.space.s5,
      paddingVertical: theme.space.s6,
    },
    header: { marginBottom: theme.space.s3 },
    headerRule: {
      height: theme.depth.ruleHeavy,
      backgroundColor: theme.color.borderStrong,
      marginTop: theme.space.s2,
      alignSelf: 'flex-start',
      width: theme.space.s10,
    },
    content: { flexShrink: 1 },
    footer: {
      marginTop: theme.space.s4,
      gap: theme.space.s2,
    },
  });
