import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { signOut } from '@/auth/authActions';
import { useAuth } from '@/auth/useAuth';
import { formatMemberSince, getInitials } from '@/core/format';
import { useProfile, useUpdateProfile } from '@/queries/profile';
import { Button } from '@/ui/Button';
import { Icon } from '@/ui/icons';
import { Plate } from '@/ui/Plate';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { Text } from '@/ui/Text';
import { useToast } from '@/ui/ToastContext';
import { useTheme, type Theme } from '@/ui/useTheme';

export default function ProfileScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const { showToast } = useToast();
  const profileQuery = useProfile(userId);
  const toastError = useCallback((msg: string) => showToast(msg, 'error'), [showToast]);
  const updateProfile = useUpdateProfile(userId, toastError);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [displayName, setDisplayName] = useState('');
  const [signingOut, setSigningOut] = useState(false);
  useEffect(() => {
    setDisplayName(profileQuery.data?.display_name ?? '');
  }, [profileQuery.data?.display_name]);

  const handleSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }, []);

  if (!userId) return null;

  const initials = getInitials(profileQuery.data?.display_name ?? null, user?.email);
  const memberSince = profileQuery.data
    ? formatMemberSince(profileQuery.data.created_at)
    : '';

  const currentUnits = profileQuery.data?.units ?? 'kg';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.scroll}>
        <View style={styles.headerRow}>
          <Text variant="display" color={theme.color.ink} style={styles.title}>
            Profile
          </Text>
          <SyncIndicator />
        </View>

        <Plate faceStyle={styles.userFace}>
          <View style={styles.avatar}>
            <Text variant="title" color={theme.color.onAccent}>
              {initials}
            </Text>
          </View>
          <Text variant="body" color={theme.color.ink} style={styles.centered}>
            {user?.email}
          </Text>
          {memberSince ? (
            <Text variant="meta" color={theme.color.inkSecondary} style={styles.centered}>
              Member since {memberSince}
            </Text>
          ) : null}
        </Plate>

        <Plate faceStyle={styles.fieldFace}>
          <Text variant="label" color={theme.color.inkTertiary}>
            Display name
          </Text>
          <TextInput
            value={displayName}
            onChangeText={setDisplayName}
            onBlur={() => {
              if (displayName !== (profileQuery.data?.display_name ?? '')) {
                updateProfile.mutate({ display_name: displayName || null });
              }
            }}
            placeholder="Your name"
            placeholderTextColor={theme.color.inkTertiary}
            style={styles.input}
          />
        </Plate>

        <Plate faceStyle={styles.fieldFace}>
          <Text variant="label" color={theme.color.inkTertiary}>
            Units
          </Text>
          <View style={styles.segment}>
            {(['kg', 'lb'] as const).map((u) => {
              const active = currentUnits === u;
              return (
                <Plate
                  key={u}
                  offset="none"
                  tone={active ? 'accent' : 'surface2'}
                  border="strong"
                  radius="sm"
                  onPress={() => updateProfile.mutate({ units: u })}
                  accessibilityRole="button"
                  accessibilityLabel={`Use ${u === 'kg' ? 'kilograms' : 'pounds'}`}
                  accessibilityState={{ selected: active }}
                  style={styles.segmentItem}
                  faceStyle={styles.segmentFace}
                >
                  <Text
                    variant="card"
                    color={active ? theme.color.onAccent : theme.color.inkSecondary}
                    style={styles.segmentText}
                  >
                    {u.toUpperCase()}
                  </Text>
                </Plate>
              );
            })}
          </View>
        </Plate>

        <Plate
          onPress={() => router.push('/profile/plan')}
          accessibilityRole="button"
          accessibilityLabel="Training plan"
          faceStyle={styles.navFace}
        >
          <Text variant="card" color={theme.color.ink} style={styles.navLabel}>
            Training plan
          </Text>
          <Icon name="chevron-right" size={20} color={theme.color.inkTertiary} />
        </Plate>

        <Button
          label="Sign out"
          kind="danger"
          size="cta"
          loading={signingOut}
          onPress={handleSignOut}
          accessibilityLabel="Sign out"
          style={styles.signOut}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    scroll: {
      padding: theme.space.page,
      gap: theme.space.s4,
      paddingBottom: theme.space.s12,
    },
    headerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.space.s3 },
    title: { flex: 1 },
    userFace: {
      padding: theme.space.s4,
      gap: theme.space.s2,
      alignItems: 'center',
    },
    avatar: {
      width: theme.touch.avatar,
      height: theme.touch.avatar,
      borderRadius: theme.radius.full,
      backgroundColor: theme.color.accent,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centered: { textAlign: 'center' },
    fieldFace: { padding: theme.space.s4, gap: theme.space.s2 },
    input: {
      height: 44,
      paddingHorizontal: theme.space.s3,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.bg,
      borderWidth: theme.depth.rule,
      borderColor: theme.color.border,
      fontSize: theme.font.size.body,
      fontFamily: theme.font.family.sans,
      color: theme.color.ink,
    },
    segment: { flexDirection: 'row', gap: theme.space.s2 },
    segmentItem: { flex: 1 },
    segmentFace: {
      minHeight: theme.touch.min,
      alignItems: 'center',
      justifyContent: 'center',
    },
    segmentText: { letterSpacing: 1 },
    navFace: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: theme.touch.min,
      padding: theme.space.s4,
      gap: theme.space.s3,
    },
    navLabel: { flex: 1 },
    signOut: { marginTop: theme.space.s4 },
  });
