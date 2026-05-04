import { Redirect } from 'expo-router';
import { View } from 'react-native';

import { useAuth } from '@/auth/useAuth';
import { theme } from '@/ui/theme';

export default function Index() {
  const { session, loading } = useAuth();

  if (loading) {
    return <View style={{ flex: 1, backgroundColor: theme.color.bg }} />;
  }
  return <Redirect href={session ? '/(tabs)/today' : '/login'} />;
}
