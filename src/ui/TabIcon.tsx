import { type ColorValue } from 'react-native';
import Svg, { Circle, Path } from 'react-native-svg';

type Name = 'today' | 'progress' | 'profile';

interface Props {
  name: Name;
  color: ColorValue;
  focused: boolean;
  size?: number;
}

export function TabIcon({ name, color, size = 22 }: Props) {
  switch (name) {
    case 'today':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="12" r="9" stroke={color} strokeWidth="1.8" />
          <Path d="M12 7v5l3 2" stroke={color} strokeWidth="1.8" strokeLinecap="round" />
        </Svg>
      );
    case 'progress':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Path
            d="M4 18l5-6 4 4 7-9"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </Svg>
      );
    case 'profile':
      return (
        <Svg width={size} height={size} viewBox="0 0 24 24" fill="none">
          <Circle cx="12" cy="8" r="3.5" stroke={color} strokeWidth="1.8" />
          <Path
            d="M4.5 20c1.5-3.5 4.3-5 7.5-5s6 1.5 7.5 5"
            stroke={color}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </Svg>
      );
  }
}
