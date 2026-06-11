import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { safeRoute } from '@/lib/safeRoute';
import { signOut } from '@/auth/authActions';
import { useAuth } from '@/auth/useAuth';
import { formatMemberSince, getInitials } from '@/core/format';
import { useProfile, useUpdateProfile } from '@/queries/profile';
import { skins, SKIN_IDS, SKIN_META } from '@/ui/skins';
import { useSkin } from '@/ui/SkinContext';
import { SyncIndicator } from '@/ui/SyncIndicator';
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
  const { skin: activeSkin, setSkin } = useSkin();

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
          <Text style={styles.title}>Profile</Text>
          <SyncIndicator />
        </View>

        <View style={styles.card}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initials}</Text>
          </View>
          <Text style={styles.email}>{user?.email}</Text>
          {memberSince ? <Text style={styles.meta}>Member since {memberSince}</Text> : null}
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Display name</Text>
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
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Units</Text>
          <View style={styles.segment}>
            {(['kg', 'lb'] as const).map((u) => (
              <Pressable
                key={u}
                onPress={() => updateProfile.mutate({ units: u })}
                style={[
                  styles.segmentButton,
                  currentUnits === u && styles.segmentButtonActive,
                ]}
              >
                <Text
                  style={[
                    styles.segmentText,
                    currentUnits === u && styles.segmentTextActive,
                  ]}
                >
                  {u.toUpperCase()}
                </Text>
              </Pressable>
            ))}
          </View>
        </View>

        <View style={styles.card}>
          <Text style={styles.fieldLabel}>Appearance</Text>
          {SKIN_IDS.map((id) => {
            const preview = skins[id][theme.scheme];
            const selected = id === activeSkin;
            return (
              <Pressable
                key={id}
                onPress={() => void setSkin(id)}
                accessibilityRole="button"
                accessibilityLabel={`${SKIN_META[id].name} appearance`}
                accessibilityState={{ selected }}
                style={({ pressed }) => [
                  styles.skinRow,
                  selected && styles.skinRowActive,
                  pressed && { opacity: 0.85 },
                ]}
              >
                <View style={[styles.skinSwatch, { backgroundColor: preview.bg }]}>
                  <View style={[styles.skinSwatchSurface, { backgroundColor: preview.surface }]} />
                  <View style={[styles.skinSwatchDot, { backgroundColor: preview.accent }]} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={styles.skinName}>{SKIN_META[id].name}</Text>
                  <Text style={styles.skinBlurb}>{SKIN_META[id].blurb}</Text>
                </View>
                {selected ? <Text style={styles.skinCheck}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>

        <Pressable
          onPress={() => router.push(safeRoute('/profile/plan'))}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.rowLabel}>Training plan</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>

        <Pressable
          onPress={handleSignOut}
          style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.85 }]}
        >
          {signingOut ? (
            <ActivityIndicator color={theme.color.danger} />
          ) : (
            <Text style={styles.signOutText}>Sign out</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  scroll: { padding: theme.space.page, gap: theme.space.s4, paddingBottom: theme.space.s12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.space.s3 },
  title: {
    flex: 1,
    fontSize: theme.font.size.display,
    fontFamily: theme.font.family.sansSemibold,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.ink,
    letterSpacing: -0.5,
  },
  card: {
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    padding: theme.space.s4,
    borderWidth: 1,
    borderColor: theme.color.border,
    gap: theme.space.s2,
  },
  avatar: {
    alignSelf: 'center',
    width: theme.touch.avatar,
    height: theme.touch.avatar,
    borderRadius: theme.touch.avatarRadius,
    backgroundColor: theme.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: theme.color.onAccent,
    fontSize: theme.font.size.title,
    fontFamily: theme.font.family.sansSemibold,
    fontWeight: theme.font.weight.semibold,
  },
  email: {
    textAlign: 'center',
    fontSize: theme.font.size.body,
    color: theme.color.ink,
    fontFamily: theme.font.family.sansMedium,
    fontWeight: theme.font.weight.medium,
  },
  meta: { textAlign: 'center', fontSize: theme.font.size.meta, fontFamily: theme.font.family.sans, color: theme.color.inkSecondary },
  fieldLabel: {
    fontSize: theme.font.size.micro,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: theme.color.inkTertiary,
    fontFamily: theme.font.family.sansMedium,
    fontWeight: theme.font.weight.medium,
  },
  input: {
    height: 44,
    paddingHorizontal: theme.space.s3,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.bg,
    fontSize: theme.font.size.body,
    fontFamily: theme.font.family.sans,
    color: theme.color.ink,
  },
  segment: {
    flexDirection: 'row',
    backgroundColor: theme.color.bg,
    borderRadius: theme.radius.sm,
    padding: 3,
  },
  segmentButton: {
    flex: 1,
    paddingVertical: theme.space.s2,
    borderRadius: theme.radius.sm,
    alignItems: 'center',
  },
  segmentButtonActive: {
    backgroundColor: theme.color.surface,
  },
  segmentText: {
    fontSize: theme.font.size.meta,
    color: theme.color.inkSecondary,
    fontFamily: theme.font.family.sansMedium,
    fontWeight: theme.font.weight.medium,
  },
  segmentTextActive: { color: theme.color.ink },
  skinRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.s3,
    paddingVertical: theme.space.s2,
    paddingHorizontal: theme.space.s2,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: 'transparent',
  },
  skinRowActive: {
    borderColor: theme.color.accent,
    backgroundColor: theme.color.bg,
  },
  skinSwatch: {
    width: 40,
    height: 40,
    borderRadius: theme.radius.sm,
    borderWidth: 1,
    borderColor: theme.color.border,
    overflow: 'hidden',
    justifyContent: 'flex-end',
    padding: 4,
  },
  skinSwatchSurface: {
    position: 'absolute',
    top: 4,
    left: 4,
    right: 12,
    height: 10,
    borderRadius: 3,
  },
  skinSwatchDot: { width: 12, height: 12, borderRadius: 6 },
  skinName: {
    fontSize: theme.font.size.body,
    color: theme.color.ink,
    fontFamily: theme.font.family.sansMedium,
    fontWeight: theme.font.weight.medium,
  },
  skinBlurb: { fontSize: theme.font.size.meta, fontFamily: theme.font.family.sans, color: theme.color.inkSecondary, marginTop: 1 },
  skinCheck: { fontSize: theme.font.size.title, fontFamily: theme.font.family.sans, color: theme.color.accent },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.space.s4,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  rowLabel: { flex: 1, fontSize: theme.font.size.body, fontFamily: theme.font.family.sans, color: theme.color.ink },
  rowChevron: { fontSize: theme.font.size.title, fontFamily: theme.font.family.sans, color: theme.color.inkTertiary },
  signOut: {
    padding: theme.space.s4,
    alignItems: 'center',
    marginTop: theme.space.s4,
  },
  signOutText: {
    fontSize: theme.font.size.body,
    color: theme.color.danger,
    fontFamily: theme.font.family.sansMedium,
    fontWeight: theme.font.weight.medium,
  },
  });
