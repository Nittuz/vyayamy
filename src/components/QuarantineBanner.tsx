import { Pressable, StyleSheet, Text } from 'react-native';

import { haptics } from '@/ui/haptics';
import { useTheme } from '@/ui/useTheme';

interface Props {
  staleCount: number;
  onPress: () => void;
}

export function QuarantineBanner({ staleCount, onPress }: Props) {
  const theme = useTheme();
  if (staleCount === 0) return null;
  const label = staleCount === 1 ? "1 item didn't sync" : `${staleCount} items didn't sync`;

  return (
    <Pressable
      onPress={() => {
        haptics.light();
        onPress();
      }}
      accessibilityRole="button"
      style={({ pressed }) => [
        styles.banner,
        {
          backgroundColor: theme.color.dangerSoft,
          borderColor: theme.color.danger,
          opacity: pressed ? 0.85 : 1,
        },
      ]}
    >
      <Text
        style={[
          styles.text,
          {
            color: theme.color.danger,
            fontFamily: theme.font.family.sansMedium,
          },
        ]}
      >
        {label} · Tap to review
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  banner: {
    marginHorizontal: 16,
    marginTop: 12,
    paddingVertical: 10,
    paddingHorizontal: 14,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize: 12,
    letterSpacing: 0.2,
  },
});
