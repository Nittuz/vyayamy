import { router } from 'expo-router';
import { useEffect, useState } from 'react';
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

import { supabase } from '@/auth/supabase';
import { useAuth } from '@/auth/useAuth';
import { formatMemberSince, getInitials } from '@/core/format';
import { useProfile, useUpdateProfile } from '@/queries/profile';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { theme } from '@/ui/theme';

export default function ProfileScreen() {
  const { user } = useAuth();
  const userId = user?.id;
  const profileQuery = useProfile(userId);
  const updateProfile = useUpdateProfile(userId);

  const [displayName, setDisplayName] = useState('');
  useEffect(() => {
    setDisplayName(profileQuery.data?.display_name ?? '');
  }, [profileQuery.data?.display_name]);

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
            placeholderTextColor={theme.color.textTertiary}
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

        <Pressable
          onPress={() => router.push('/profile/plan' as never)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}
        >
          <Text style={styles.rowLabel}>Training plan</Text>
          <Text style={styles.rowChevron}>›</Text>
        </Pressable>

        <Pressable
          onPress={async () => {
            await supabase.auth.signOut();
          }}
          style={({ pressed }) => [styles.signOut, pressed && { opacity: 0.85 }]}
        >
          {updateProfile.isPending ? (
            <ActivityIndicator color={theme.color.danger} />
          ) : (
            <Text style={styles.signOutText}>Sign out</Text>
          )}
        </Pressable>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: theme.color.bg },
  scroll: { padding: theme.space.page, gap: theme.space.s4, paddingBottom: theme.space.s12 },
  headerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.space.s3 },
  title: {
    flex: 1,
    fontSize: theme.font.display,
    fontWeight: theme.font.weight.bold,
    color: theme.color.text,
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
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: theme.color.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: theme.color.onAccent,
    fontSize: 20,
    fontWeight: theme.font.weight.bold,
  },
  email: {
    textAlign: 'center',
    fontSize: theme.font.body,
    color: theme.color.text,
    fontWeight: theme.font.weight.medium,
  },
  meta: { textAlign: 'center', fontSize: theme.font.meta, color: theme.color.textSecondary },
  fieldLabel: {
    fontSize: theme.font.micro,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    color: theme.color.textTertiary,
    fontWeight: theme.font.weight.medium,
  },
  input: {
    height: 44,
    paddingHorizontal: theme.space.s3,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.bg,
    fontSize: theme.font.body,
    color: theme.color.text,
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
    fontSize: theme.font.meta,
    color: theme.color.textSecondary,
    fontWeight: theme.font.weight.medium,
  },
  segmentTextActive: { color: theme.color.text },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: theme.space.s4,
    backgroundColor: theme.color.surface,
    borderRadius: theme.radius.md,
    borderWidth: 1,
    borderColor: theme.color.border,
  },
  rowLabel: { flex: 1, fontSize: theme.font.body, color: theme.color.text },
  rowChevron: { fontSize: 22, color: theme.color.textTertiary },
  signOut: {
    padding: theme.space.s4,
    alignItems: 'center',
    marginTop: theme.space.s4,
  },
  signOutText: {
    fontSize: theme.font.body,
    color: theme.color.danger,
    fontWeight: theme.font.weight.medium,
  },
});
