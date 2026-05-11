/**
 * Compact sync-state pill rendered in the header of the active
 * workout and other long-running screens. Reads from the sync state
 * pubsub (no React Query coupling).
 */
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { deriveSyncState, syncStateLabel } from '@/core/syncHelpers';
import { getSyncState, subscribeSync, type SyncState as EngineState } from '@/sync/state';

import { theme } from './theme';

export function SyncIndicator() {
  const [state, setState] = useState<EngineState>(() => getSyncState());
  useEffect(() => subscribeSync(setState), []);

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
    <View
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
    </View>
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
