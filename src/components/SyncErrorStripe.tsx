import { useEffect, useRef } from 'react';
import { Animated, StyleSheet } from 'react-native';

import { useSyncStateLive } from '@/sync/useSyncStateLive';
import { useTheme } from '@/ui/useTheme';

const PULSE_WINDOW_MS = 30_000;
const PERSISTENT_AGE_MS = 5 * 60_000;

export function SyncErrorStripe() {
  const theme = useTheme();
  const sync = useSyncStateLive();
  const opacity = useRef(new Animated.Value(0)).current;
  const loopRef = useRef<Animated.CompositeAnimation | null>(null);

  useEffect(() => {
    const now = Date.now();
    const lastErrorMs = sync.lastErrorAt ? new Date(sync.lastErrorAt).getTime() : null;
    const isRecentError = lastErrorMs !== null && now - lastErrorMs < PULSE_WINDOW_MS;
    const isPersistent = sync.pendingOutbox > 0 && lastErrorMs !== null && now - lastErrorMs > PERSISTENT_AGE_MS;

    // Stop existing loop
    if (loopRef.current) {
      loopRef.current.stop();
      loopRef.current = null;
    }

    if (isRecentError) {
      // Pulse 0.3 ↔ 0.7
      opacity.setValue(0.3);
      const loop = Animated.loop(
        Animated.sequence([
          Animated.timing(opacity, { toValue: 0.7, duration: 500, useNativeDriver: true }),
          Animated.timing(opacity, { toValue: 0.3, duration: 500, useNativeDriver: true }),
        ]),
      );
      loop.start();
      loopRef.current = loop;
      // Re-evaluate after the pulse window expires
      const t = setTimeout(() => {
        // Force re-render via state read on next tick
        opacity.setValue(0);
      }, PULSE_WINDOW_MS - (now - (lastErrorMs ?? now)));
      return () => clearTimeout(t);
    }

    if (isPersistent) {
      Animated.timing(opacity, { toValue: 0.7, duration: 200, useNativeDriver: true }).start();
      return;
    }

    Animated.timing(opacity, { toValue: 0, duration: 200, useNativeDriver: true }).start();
  }, [sync.lastErrorAt, sync.pendingOutbox, opacity]);

  useEffect(() => {
    return () => {
      if (loopRef.current) loopRef.current.stop();
    };
  }, []);

  return (
    <Animated.View
      style={[
        styles.stripe,
        {
          backgroundColor: theme.color.danger,
          opacity,
        },
      ]}
      pointerEvents="none"
    />
  );
}

const styles = StyleSheet.create({
  stripe: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 1,
    zIndex: 100,
  },
});
