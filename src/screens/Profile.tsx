import { router } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AppState,
  KeyboardAvoidingView,
  Linking,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from 'react-native';

import { signOut } from '@/auth/authActions';
import { useAuth } from '@/auth/useAuth';
import { formatMemberSince, getInitials, identityLines } from '@/core/format';
import type { RestAlertStatus } from '@/lib/notificationStatus';
import { useProfile, useUpdateProfile } from '@/queries/profile';
import { getRestAlertStatus, primeRestAlerts } from '@/rest/notifications';
import { getOutboxCount } from '@/sync/outboxPreview';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Icon } from '@/ui/icons';
import { Plate } from '@/ui/Plate';
import { Segment } from '@/ui/Segment';
import { SettleSlam } from '@/ui/SettleSlam';
import { SyncIndicator } from '@/ui/SyncIndicator';
import { Text } from '@/ui/Text';
import { useToast } from '@/ui/ToastContext';
import { useTheme, type Theme } from '@/ui/useTheme';

const REST_ALERT_COPY: Record<RestAlertStatus, { value: string; hint: string; a11yHint: string }> =
  {
    granted: {
      value: 'ON',
      hint: 'You’ll get an alert when rest ends. Manage in Settings.',
      a11yHint: 'Opens system notification settings',
    },
    provisional: {
      value: 'MUTED',
      hint: 'Alerts arrive quietly, without sound. Tap for full alerts.',
      a11yHint: 'Asks for notification permission',
    },
    undetermined: {
      value: 'OFF',
      hint: 'Tap to get an alert when rest ends.',
      a11yHint: 'Asks for notification permission',
    },
    denied: {
      value: 'OFF',
      hint: 'Turn on notifications in Settings.',
      a11yHint: 'Opens system notification settings',
    },
  };

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
  // Sign-out gate (spec 2026-08-22 §4): null = no confirm pending, a number
  // (including 0, though 0 signs out immediately below) is the pending
  // outbox count named in the confirm copy.
  const [pendingCount, setPendingCount] = useState<number | null>(null);
  // Ref latch against a double-tap landing mid-await of getOutboxCount()
  // (HistoryDetail's deletingRef precedent) — a state flag alone can't stop
  // a second tap that lands before the first render commits.
  const checkingOutboxRef = useRef(false);
  useEffect(() => {
    setDisplayName(profileQuery.data?.display_name ?? '');
  }, [profileQuery.data?.display_name]);

  // Rest-alert permission state (#158). Re-checked when the app returns to
  // foreground so a trip to Settings is reflected on return.
  const [restStatus, setRestStatus] = useState<RestAlertStatus | null>(null);
  useEffect(() => {
    let active = true;
    const refresh = () => {
      void getRestAlertStatus().then((s) => {
        if (active) setRestStatus(s);
      });
    };
    refresh();
    const sub = AppState.addEventListener('change', (state) => {
      if (state === 'active') refresh();
    });
    return () => {
      active = false;
      sub.remove();
    };
  }, []);

  const onRestAlertsPress = useCallback(async () => {
    // Denied cannot be re-prompted in-app: recovery is the system settings
    // screen. Granted also routes there (that is where alerts are managed).
    if (restStatus === 'denied' || restStatus === 'granted') {
      await Linking.openSettings();
      return;
    }
    setRestStatus(await primeRestAlerts());
  }, [restStatus]);

  const doSignOut = useCallback(async () => {
    setSigningOut(true);
    try {
      await signOut();
    } finally {
      setSigningOut(false);
    }
  }, []);

  // Gate (spec 2026-08-22 §4): query the outbox directly at tap time (no
  // reliance on possibly-stale sync state). Zero pending signs out
  // immediately — fully recoverable via pull after re-login — otherwise a
  // destructive confirm names the cost.
  const handleSignOut = useCallback(async () => {
    if (checkingOutboxRef.current) return;
    checkingOutboxRef.current = true;
    try {
      const pending = await getOutboxCount();
      if (pending > 0) {
        setPendingCount(pending);
      } else {
        await doSignOut();
      }
    } finally {
      checkingOutboxRef.current = false;
    }
  }, [doSignOut]);

  if (!userId) return null;

  const initials = getInitials(profileQuery.data?.display_name ?? null, user?.email);
  const memberSince = profileQuery.data ? formatMemberSince(profileQuery.data.created_at) : '';
  // Polish A: the display name leads once one exists; email demotes to a
  // secondary line beneath it. With no display name, email keeps leading
  // exactly as before (secondary is null, so only one line renders).
  const identity = identityLines(profileQuery.data?.display_name, user?.email);

  const currentUnits = profileQuery.data?.units ?? 'kg';
  const restCopy = restStatus ? REST_ALERT_COPY[restStatus] : null;

  return (
    <SafeAreaView style={styles.container}>
      {/* Keyboard avoidance mirrors Login — the display-name field must not
          hide behind the keyboard (impeccable batch 4). */}
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.kav}
      >
        <ScrollView contentContainerStyle={styles.scroll}>
          <View style={styles.headerRow}>
            <SettleSlam style={styles.title}>
              <Text variant="displayXL" color={theme.color.inkHero}>
                Profile
              </Text>
            </SettleSlam>
            <SyncIndicator />
          </View>

          <View style={styles.identity}>
            <View style={styles.avatar}>
              <Text variant="title" color={theme.color.ink}>
                {initials}
              </Text>
            </View>
            <Text
              variant={identity.secondary ? 'title' : 'numeral'}
              color={identity.secondary ? theme.color.ink : theme.color.inkSecondary}
            >
              {identity.headline}
            </Text>
            {identity.secondary ? (
              <Text variant="numeral" color={theme.color.inkSecondary}>
                {identity.secondary}
              </Text>
            ) : null}
            {memberSince ? (
              <Text variant="strip" color={theme.color.inkTertiary}>
                Member since {memberSince}
              </Text>
            ) : null}
          </View>

          <Plate faceStyle={styles.fieldFace}>
            <Text variant="meta" color={theme.color.inkTertiary}>
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
              accessibilityLabel="Display name"
              style={styles.input}
            />
          </Plate>

          <Plate faceStyle={styles.fieldFace}>
            <Text variant="meta" color={theme.color.inkTertiary}>
              Units
            </Text>
            <Segment
              options={[
                { value: 'kg', label: 'KG', accessibilityLabel: 'Use kilograms' },
                { value: 'lb', label: 'LB', accessibilityLabel: 'Use pounds' },
              ]}
              value={currentUnits}
              onChange={(u) => updateProfile.mutate({ units: u })}
            />
          </Plate>

          <Plate
            tone="ghost"
            border="soft"
            onPress={() => void onRestAlertsPress()}
            accessibilityRole="button"
            accessibilityLabel={
              restCopy ? `Rest alerts, ${restCopy.value.toLowerCase()}` : 'Rest alerts'
            }
            accessibilityHint={restCopy?.a11yHint}
            faceStyle={styles.navFace}
          >
            <View style={styles.navText}>
              <Text variant="card" color={theme.color.ink}>
                Rest alerts
              </Text>
              {restCopy ? (
                <Text variant="meta" color={theme.color.inkTertiary}>
                  {restCopy.hint}
                </Text>
              ) : null}
            </View>
            {/* Trailing chevron (polish B): matches Training plan's exactly —
                the row routes to iOS Settings, so it should read as tappable
                the same way. */}
            <View style={styles.restAlertsTrailing}>
              <Text variant="numeral" color={theme.color.inkSecondary}>
                {restCopy?.value ?? ''}
              </Text>
              <Icon name="chevron-right" size={20} color={theme.color.inkTertiary} />
            </View>
          </Plate>

          <Plate
            tone="ghost"
            border="soft"
            onPress={() => router.push('/profile/plan')}
            accessibilityRole="button"
            accessibilityLabel="Training plan"
            faceStyle={styles.navFace}
          >
            <Text variant="card" color={theme.color.ink} style={styles.navText}>
              Training plan
            </Text>
            <Icon name="chevron-right" size={20} color={theme.color.inkTertiary} />
          </Plate>

          {/* Demoted (polish C): hairline rule + section margin, mirroring
              HistoryDetail's deleteSection — Sign out joins the screen's
              rhythm as a full-width row instead of reading as a centered
              box on an otherwise left-aligned screen. */}
          <View style={styles.signOutSection}>
            <Button
              label="Sign out"
              kind="danger"
              size="row"
              loading={signingOut}
              onPress={handleSignOut}
              accessibilityLabel="Sign out"
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
      <ConfirmSheet
        visible={pendingCount != null}
        onClose={() => setPendingCount(null)}
        title="Sign out?"
        message={`${pendingCount} unsynced ${pendingCount === 1 ? 'change' : 'changes'} will be lost.`}
        confirmLabel="Sign out anyway"
        destructive
        onConfirm={doSignOut}
      />
    </SafeAreaView>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    container: { flex: 1, backgroundColor: theme.color.bg },
    kav: { flex: 1 },
    scroll: {
      padding: theme.space.page,
      gap: theme.space.s4,
      paddingBottom: theme.space.s12,
    },
    headerRow: { flexDirection: 'row', alignItems: 'flex-end', gap: theme.space.s3 },
    title: { flex: 1 },
    // Identity is a ghost composition: no plate, just the chalk-on-blacktop
    // ring, a headline (name if there is one, else the address), an optional
    // demoted address line, and a mono member strip (impeccable polish A).
    identity: {
      alignItems: 'flex-start',
      gap: theme.space.s2,
      paddingVertical: theme.space.s2,
    },
    avatar: {
      width: theme.touch.avatar,
      height: theme.touch.avatar,
      borderRadius: theme.radius.full,
      borderWidth: theme.depth.hairline,
      borderColor: theme.color.ink,
      backgroundColor: 'transparent',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: theme.space.s1,
    },
    fieldFace: { padding: theme.space.s4, gap: theme.space.s2 },
    input: {
      height: 44,
      paddingHorizontal: theme.space.s3,
      backgroundColor: theme.color.bg,
      borderWidth: theme.depth.hairline,
      borderColor: theme.color.border,
      fontSize: theme.font.size.body,
      fontFamily: theme.font.family.sans,
      color: theme.color.ink,
    },
    navFace: {
      flexDirection: 'row',
      alignItems: 'center',
      minHeight: theme.touch.min,
      padding: theme.space.s4,
      gap: theme.space.s3,
    },
    navText: { flex: 1, gap: theme.space.half },
    restAlertsTrailing: { flexDirection: 'row', alignItems: 'center', gap: theme.space.s2 },
    // Mirrors HistoryDetail's deleteSection idiom exactly (impeccable polish
    // C): a hairline rule + extra top margin demotes the destructive action
    // below it, same as Delete workout there.
    signOutSection: {
      marginTop: theme.space.section,
      paddingTop: theme.space.section,
      borderTopWidth: theme.depth.hairline,
      borderTopColor: theme.color.border,
    },
  });
