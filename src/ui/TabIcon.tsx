import { type ColorValue } from 'react-native';

import { Icon, type IconName } from './icons';

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
  return (
    <Icon name={NAME_MAP[name]} size={size} color={String(color)} stroke={focused ? 2.5 : 2} />
  );
}
