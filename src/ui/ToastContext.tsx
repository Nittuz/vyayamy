import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, Text, View } from 'react-native';
import Animated, {
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withSequence,
  withTiming,
} from 'react-native-reanimated';

import { motion } from './motion';
import { useTheme, type Theme } from './useTheme';
import { isSyncError } from './syncErrors';

export { isSyncError };

/** How long the toast holds fully visible between fade-in and fade-out. */
const TOAST_HOLD_MS = 2200;

type ToastKind = 'info' | 'success' | 'error';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

interface ToastContextValue {
  showToast: (message: string, kind?: ToastKind) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const ctx = useContext(ToastContext);
  if (!ctx) throw new Error('useToast must be used within ToastProvider');
  return ctx;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [toast, setToast] = useState<ToastItem | null>(null);
  const opacity = useSharedValue(0);
  const idRef = useRef(0);

  // Read once on mount (Sheet/FadeInView precedent). A ref, not state, so
  // showToast keeps a stable identity for the provider's lifetime.
  const reduceMotionRef = useRef(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled()
      .then((r) => {
        reduceMotionRef.current = r;
      })
      .catch(() => {
        /* default: motion allowed */
      });
  }, []);

  // Retire the toast only if a newer one hasn't replaced it meanwhile.
  const retire = useCallback((id: number) => {
    setToast((current) => (current?.id === id ? null : current));
  }, []);

  const showToast = useCallback(
    (message: string, kind: ToastKind = 'info') => {
      idRef.current += 1;
      const id = idRef.current;
      setToast({ id, message, kind });
      // Reduced motion: same lifecycle, but appear/disappear are instant.
      const inMs = reduceMotionRef.current ? 0 : motion.duration.fast;
      const outMs = reduceMotionRef.current ? 0 : motion.duration.base;
      opacity.value = withSequence(
        withTiming(1, { duration: inMs }),
        withDelay(
          TOAST_HOLD_MS,
          withTiming(0, { duration: outMs }, (finished) => {
            // A newer toast cancels this chain (finished false) and owns the fade.
            if (finished) runOnJS(retire)(id);
          }),
        ),
      );
    },
    [opacity, retire],
  );

  const value = useMemo(() => ({ showToast }), [showToast]);

  const animatedStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));

  return (
    <ToastContext.Provider value={value}>
      {children}
      {toast ? (
        <Animated.View pointerEvents="none" style={[styles.wrap, animatedStyle]}>
          <View style={[styles.toast, toast.kind === 'error' && styles.error]}>
            <Text style={[styles.text, toast.kind === 'error' && styles.errorText]}>{toast.message}</Text>
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

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 100,
      alignItems: 'center',
    },
    toast: {
      maxWidth: 360,
      paddingHorizontal: theme.space.s4,
      paddingVertical: theme.space.s3,
      borderRadius: theme.radius.md,
      // Inverted pill: ink-on-bg stays high-contrast in both schemes (was pinned
      // to the dark palette, so it clashed in light mode and other skins, #23).
      backgroundColor: theme.color.ink,
    },
    error: {
      backgroundColor: theme.color.danger,
    },
    text: {
      color: theme.color.bg,
      fontSize: theme.font.size.meta,
      fontFamily: theme.font.family.sansMedium,
      fontWeight: theme.font.weight.medium,
      lineHeight: 20,
    },
    errorText: {
      color: theme.color.onAccent, // reads on the danger fill in both schemes
    },
  });
