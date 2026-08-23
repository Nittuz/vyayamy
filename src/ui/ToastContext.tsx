import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import Animated, {
  cancelAnimation,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { motion } from './motion';
import { PRESS_DIP_OPACITY } from './plateStyles';
import {
  actionAccessibilityLabel,
  attemptActionLatch,
  resolveToastActionAccent,
  resolveToastMessageColor,
  resolveToastTiming,
} from './toastLogic';
import { useReduceMotion } from './useReduceMotion';
import { useTheme, type Theme } from './useTheme';
import { isSyncError } from './syncErrors';

type ToastKind = 'info' | 'success' | 'error';

/** Optional action slot (undo spec §2) — omitting it keeps showToast byte-compatible. */
export interface ToastActionOpts {
  actionLabel?: string;
  onAction?: () => void;
  /** Overrides the default hold (TOAST_HOLD_MS in toastLogic.ts) for this toast. */
  holdMs?: number;
}

interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
  opts?: ToastActionOpts;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind, opts?: ToastActionOpts) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => makeStyles(theme, insets.bottom), [theme, insets.bottom]);
  const [toast, setToast] = useState<ToastItem | null>(null);
  const opacity = useSharedValue(0);
  const idRef = useRef(0);

  // Live reduced motion, sourced from the shared hook. A ref, not state, so
  // showToast keeps a stable identity for the provider's lifetime — only read
  // from showToast itself, never mid-render, so the sync can run in an effect.
  const reduceMotion = useReduceMotion();
  const reduceMotionRef = useRef(reduceMotion);
  useEffect(() => {
    reduceMotionRef.current = reduceMotion;
  }, [reduceMotion]);

  // Retire the toast only if a newer one hasn't replaced it meanwhile.
  const retire = useCallback((id: number) => {
    setToast((current) => (current?.id === id ? null : current));
  }, []);

  // Guards the action button against firing onAction twice on a rapid
  // double-tap during the fast-dismiss window (see toastLogic.ts). Scoped by
  // toast id, so a fresh toast always gets its own attempt.
  const actionLatchRef = useRef<number | null>(null);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'info', opts?: ToastActionOpts) => {
      idRef.current += 1;
      const id = idRef.current;
      // A newer toast always replaces an active one, action slot or not —
      // including one mid-hold with a pending Undo. Rare, and an undo lost to
      // a replacing toast is a known/accepted edge (undo spec §2).
      setToast({ id, message, kind, opts });
      const { inMs, holdMs, outMs } = resolveToastTiming(opts, reduceMotionRef.current);
      opacity.value = withSequence(
        withTiming(1, { duration: inMs }),
        withDelay(
          holdMs,
          withTiming(0, { duration: outMs }, (finished) => {
            // A newer toast cancels this chain (finished false) and owns the fade.
            if (finished) runOnJS(retire)(id);
          }),
        ),
      );
    },
    [opacity, retire],
  );

  // Action press: cancel the pending hold/fade chain, kick off a fast
  // dismiss (Reduce Motion-aware), THEN call onAction — a straight-line
  // sequence in this handler, not deferred to the dismiss animation's
  // `finished` callback. Deferring it would race a *different* showToast
  // landing inside the dismiss window (it cancels this animation too,
  // finished=false, and the already-latched tap would silently never fire).
  // Calling onAction here is safe even if it shows its own toast (e.g. an
  // undo failure) — retire() below is id-guarded, so it can't clobber a toast
  // onAction just created.
  const handleActionPress = useCallback(
    (item: ToastItem) => {
      if (!attemptActionLatch(actionLatchRef, item.id)) return;
      cancelAnimation(opacity);
      const outMs = reduceMotionRef.current ? 0 : motion.duration.fast;
      opacity.value = withTiming(0, { duration: outMs }, (finished) => {
        if (finished) runOnJS(retire)(item.id);
      });
      item.opts?.onAction?.();
    },
    [opacity, retire],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  const hasAction = Boolean(toast?.opts?.actionLabel);

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        // box-none only when an action is present, so the Pressable below
        // stays tappable without changing the no-action path's hit-testing
        // at all (that path keeps the original pointerEvents="none").
        <Animated.View
          pointerEvents={hasAction ? 'box-none' : 'none'}
          style={[styles.wrap, animatedStyle]}
        >
          <View style={[styles.toast, toast.kind === 'error' && styles.error]}>
            {hasAction ? (
              <View style={styles.row}>
                <Text
                  style={[
                    styles.text,
                    styles.messageInRow,
                    toast.kind === 'error' && styles.errorText,
                  ]}
                  numberOfLines={2}
                >
                  {toast.message}
                </Text>
                <Pressable
                  onPress={() => handleActionPress(toast)}
                  // Pads the compact label up to the 44pt touch minimum
                  // without inflating the pill's visual height (same idiom
                  // as WorkoutActive's voice-help link).
                  hitSlop={{
                    top: theme.space.s3,
                    bottom: theme.space.s3,
                    left: theme.space.s2,
                    right: theme.space.s2,
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={
                    toast.opts?.actionLabel
                      ? actionAccessibilityLabel(toast.opts.actionLabel, toast.message)
                      : undefined
                  }
                  style={({ pressed }) => [
                    styles.action,
                    pressed && { opacity: PRESS_DIP_OPACITY },
                  ]}
                >
                  <Text style={styles.actionText}>{toast.opts?.actionLabel}</Text>
                </Pressable>
              </View>
            ) : (
              <Text style={[styles.text, toast.kind === 'error' && styles.errorText]}>
                {toast.message}
              </Text>
            )}
          </View>
        </Animated.View>
      ) : null}
    </ToastContext.Provider>
  );
}

export function useSyncAwareErrorToast() {
  const { showToast } = useToast();
  return useCallback(
    (msg: string) => {
      if (isSyncError(msg)) return;
      showToast(msg, 'error');
    },
    [showToast],
  );
}

const makeStyles = (theme: Theme, bottomInset: number) => {
  // See resolveToastActionAccent's doc comment: the pill is self-inverted
  // (backgroundColor below is theme.color.ink, not theme.color.bg), so the
  // accent that reads on it is the OPPOSITE scheme's accent, not
  // theme.color.accent.
  const actionAccent = resolveToastActionAccent(theme.scheme);
  // See resolveToastMessageColor's doc comment: same-scheme `bg` is the
  // correct pairing against the ink-filled pill (unlike the accent above,
  // which does need the opposite palette).
  const messageColor = resolveToastMessageColor(theme.scheme);
  return StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      // True bottom anchor: safe-area inset + s4, not a guessed mid-content
      // offset (was a fixed 100, which floated the pill over list content on
      // screens without a tab bar — F2). ToastProvider mounts above the
      // navigator (app/_layout.tsx), so it has no reach into the tab bar's
      // own height; on tabbed screens (Today/Progress/Profile) this can sit
      // the toast over the tab bar instead. Per owner priority that overlap
      // is the acceptable tradeoff — floating mid-list on every non-tabbed
      // screen (WorkoutActive, HistoryDetail, and every pushed route) was
      // judged worse.
      bottom: bottomInset + theme.space.s4,
      alignItems: 'center',
    },
    toast: {
      maxWidth: 360,
      paddingHorizontal: theme.space.s4,
      paddingVertical: theme.space.s3,
      // Inverted pill: ink-on-bg stays high-contrast in both schemes (was pinned
      // to the dark palette, so it clashed in light mode, #23).
      backgroundColor: theme.color.ink,
    },
    error: {
      backgroundColor: theme.color.danger,
    },
    row: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.s3,
    },
    text: {
      color: messageColor,
      fontSize: theme.font.size.meta,
      fontFamily: theme.font.family.sansMedium,
      fontWeight: theme.font.weight.medium,
      lineHeight: 20,
    },
    // Only applied alongside an action (see `row` above) — the no-action path
    // never mixes this in, so its layout stays exactly as it was.
    messageInRow: {
      flex: 1,
    },
    errorText: {
      color: theme.color.onAccent, // reads on the danger fill in both schemes
    },
    action: {
      paddingHorizontal: theme.space.s1,
    },
    // monoMedium, not the message's sansMedium: TEXT_VARIANTS has no compact
    // monoMedium variant to reach for (hero/numeralLg are the only
    // monoMedium variants and both are display-scale), and this toast
    // already styles its own <Text> directly rather than through the shared
    // variant component — so the mono "action" read stays inline here too.
    actionText: {
      color: actionAccent,
      fontSize: theme.font.size.meta,
      fontFamily: theme.font.family.monoMedium,
      fontWeight: theme.font.weight.medium,
      lineHeight: 20,
    },
  });
};
