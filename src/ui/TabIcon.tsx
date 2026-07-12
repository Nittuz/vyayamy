/**
 * Tab bar icon with the Blacktop active treatment: chalk glyphs at constant
 * weight, and a volt underline tick beneath the focused tab (the active state
 * is the tick, never a filled or bolder icon).
 */
import { StyleSheet, View, type ColorValue } from 'react-native';

import { Icon, type IconName } from './icons';
import { useTheme } from './useTheme';

type Name = 'today' | 'progress' | 'profile';

const NAME_MAP: Record<Name, IconName> = {
  today: 'clock',
  progress: 'trend',
  profile: 'user',
};

interface Props {
  name: Name;
  color: ColorValue;
  focused: boolean;
  size?: number;
}

export function TabIcon({ name, color, focused, size = 22 }: Props) {
  const theme = useTheme();
  return (
    <View style={styles.wrap}>
      <Icon name={NAME_MAP[name]} size={size} color={String(color)} stroke={2} />
      <View
        style={[styles.tick, { backgroundColor: focused ? theme.color.accent : 'transparent' }]}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { alignItems: 'center' },
  tick: {
    width: 16,
    height: 2,
    marginTop: 3,
  },
});
