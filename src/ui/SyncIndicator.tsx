/**
 * Compact sync-state pill rendered in the header of the active
 * workout and other long-running screens. Reads from the sync state
 * pubsub (no React Query coupling).
 *
 * Phase 4: tapping the pill opens SyncDiagnosticsSheet. The diagnostics
 * sheet's "Review quarantined" link closes itself and opens the
 * QuarantineSheet (also managed here for self-containment).
 */
import { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { QuarantineSheet } from '@/components/QuarantineSheet';
import { SyncDiagnosticsSheet } from '@/components/SyncDiagnosticsSheet';
import { useQuarantined } from '@/sync/quarantine';
import { deriveSyncState, syncStateLabel } from '@/core/syncHelpers';
import { useSyncStateLive } from '@/sync/useSyncStateLive';

import { theme } from './theme';

export function SyncIndicator() {
  const state = useSyncStateLive();
  const quarantined = useQuarantined();
  const [diagOpen, setDiagOpen] = useState(false);
  const [quarOpen, setQuarOpen] = useState(false);

  const uiState = deriveSyncState({
    online: state.online,
    pushing: state.pushInFlight,
    pulling: state.pullInFlight,
    pendingOutbox: state.pendingOutbox,
    lastError: state.lastError,
    showSaved: false,
  });
  const label = syncStateLabel(uiState);
  if (!label) return null;

  return (
    <>
      <Pressable
        onPress={() => setDiagOpen(true)}
        hitSlop={8}
        accessibilityRole="button"
        accessibilityLabel="Open sync diagnostics"
        style={[
          styles.pill,
          uiState === 'offline' && styles.pillOffline,
          uiState === 'error' && styles.pillError,
        ]}
      >
        <View
          style={[
            styles.dot,
            uiState === 'offline' && styles.dotOffline,
            uiState === 'error' && styles.dotError,
            uiState === 'saved' && styles.dotSaved,
          ]}
        />
        <Text style={styles.label}>{label}</Text>
      </Pressable>
      <SyncDiagnosticsSheet
        visible={diagOpen}
        onClose={() => setDiagOpen(false)}
        onOpenQuarantine={() => {
          setDiagOpen(false);
          setQuarOpen(true);
        }}
      />
      <QuarantineSheet
        visible={quarOpen}
        rows={quarantined.data ?? []}
        onClose={() => setQuarOpen(false)}
        onChanged={() => void quarantined.refetch()}
      />
    </>
  );
}

const styles = StyleSheet.create({
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.space.s2,
    paddingVertical: theme.space.s1,
    paddingHorizontal: theme.space.s3,
    borderRadius: theme.radius.full,
    backgroundColor: theme.color.accentSoft,
  },
  pillOffline: { backgroundColor: theme.color.border },
  pillError: { backgroundColor: theme.color.dangerSoft },
  dot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.color.accentMuted,
  },
  dotOffline: { backgroundColor: theme.color.textSecondary },
  dotError: { backgroundColor: theme.color.danger },
  dotSaved: { backgroundColor: theme.color.success },
  label: {
    fontSize: theme.font.micro,
    color: theme.color.textSecondary,
    fontWeight: theme.font.weight.medium,
  },
});
