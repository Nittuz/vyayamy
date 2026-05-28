import { useEffect, useRef } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';

import { haptics } from '@/ui/haptics';
import { useTheme } from '@/ui/useTheme';

interface Props {
  running: boolean;
  elapsedSeconds: number;
  targetSeconds: number;
  onSkip: () => void;
  onOpenOverride?: () => void;
}

export function RestProgressBar({ running, elapsedSeconds, targetSeconds, onSkip, onOpenOverride }: Props) {
  const theme = useTheme();
  const widthAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const fraction = Math.min(elapsedSeconds / Math.max(targetSeconds, 1), 1);
    Animated.timing(widthAnim, {
      toValue: fraction,
      duration: 250,
      useNativeDriver: false, // width animations require layout
    }).start();
  }, [elapsedSeconds, targetSeconds, widthAnim]);

  const handleTap = () => {
    haptics.light();
    onSkip();
  };

  const handleLongPress = () => {
    if (!onOpenOverride) return;
    haptics.medium();
    onOpenOverride();
  };

  if (!running) return null;

  return (
    <Pressable
      onPress={handleTap}
      onLongPress={handleLongPress}
      delayLongPress={350}
      accessibilityLabel="Tap to skip rest, long-press for rest options"
      style={styles.touch}
    >
      <View style={[styles.bar, { backgroundColor: theme.color.border }]}>
        <Animated.View
          style={[
            styles.fill,
            {
              backgroundColor: theme.color.accent,
              width: widthAnim.interpolate({
                inputRange: [0, 1],
                outputRange: ['0%', '100%'],
              }),
            },
          ]}
        />
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  touch: {
    height: 12, // larger hit area; bar is 2px inside
    justifyContent: 'flex-start',
  },
  bar: {
    height: 2,
    width: '100%',
  },
  fill: {
    height: 2,
  },
});
