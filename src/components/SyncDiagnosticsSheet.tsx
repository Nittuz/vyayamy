import { useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { useQuarantined } from '@/sync/quarantine';
import { runSyncCycle } from '@/sync/engine';
import { getOutboxPreview, relativeAge, type OutboxPreviewRow } from '@/sync/outboxPreview';
import { useSyncStateLive } from '@/sync/useSyncStateLive';
import { Button } from '@/ui/Button';
import { haptics } from '@/ui/haptics';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onOpenQuarantine: () => void;
}

export function SyncDiagnosticsSheet({ visible, onClose, onOpenQuarantine }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const sync = useSyncStateLive();
  const quarantined = useQuarantined();
  const [preview, setPreview] = useState<OutboxPreviewRow[]>([]);
  const [syncingNow, setSyncingNow] = useState(false);

  useEffect(() => {
    if (!visible) return;
    void getOutboxPreview().then(setPreview);
  }, [visible, sync.pendingOutbox, sync.lastPushedAt, sync.lastPulledAt]);

  const handleForceSync = async () => {
    if (syncingNow) return;
    haptics.light();
    setSyncingNow(true);
    try {
      await runSyncCycle();
    } finally {
      setTimeout(() => setSyncingNow(false), 2000);
    }
  };

  const statusLabel = sync.online
    ? sync.pushInFlight || sync.pullInFlight
      ? 'syncing'
      : 'idle'
    : 'offline';

  const quarantinedCount = quarantined.data?.length ?? 0;

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Sync diagnostics"
      footer={
        <>
          <Button
            label={syncingNow ? 'Syncing…' : 'Force sync now'}
            kind="primary"
            size="row"
            loading={syncingNow}
            disabled={syncingNow}
            onPress={() => void handleForceSync()}
          />
          {quarantinedCount > 0 ? (
            <Button
              label={`Review quarantined (${quarantinedCount})`}
              kind="danger"
              size="row"
              onPress={onOpenQuarantine}
            />
          ) : null}
          <Button label="Close" kind="ghost" size="row" onPress={onClose} />
        </>
      }
    >
      <Text variant="body" color={theme.color.inkSecondary} style={styles.intro}>
        Read-only view of the sync engine's state.
      </Text>

      <ScrollView style={styles.content}>
        <Section label="STATUS" theme={theme}>
          <Row k="State" v={statusLabel} theme={theme} mono />
          <Row k="Last error" v={sync.lastError ?? 'none'} theme={theme} mono />
        </Section>

        <Section label="OUTBOX" theme={theme}>
          <Row k="Pending" v={String(sync.pendingOutbox)} theme={theme} mono />
          <Row k="Quarantined" v={String(quarantinedCount)} theme={theme} mono />
          {preview.length > 0 ? (
            <View style={styles.previewBlock}>
              <Text variant="label" color={theme.color.inkTertiary}>
                MOST RECENT
              </Text>
              {preview.map((row) => (
                <Text
                  key={row.id}
                  variant="numeral"
                  color={theme.color.ink}
                  style={styles.previewRow}
                >
                  {row.table_name} · {row.op} · {relativeAge(row.created_at)}
                </Text>
              ))}
            </View>
          ) : null}
        </Section>

        <Section label="LAST SYNC" theme={theme}>
          <Row
            k="Pushed"
            v={sync.lastPushedAt ? relativeAge(sync.lastPushedAt) : 'never'}
            theme={theme}
            mono
          />
          <Row
            k="Pulled"
            v={sync.lastPulledAt ? relativeAge(sync.lastPulledAt) : 'never'}
            theme={theme}
            mono
          />
        </Section>
      </ScrollView>
    </Sheet>
  );
}

function Section({
  label,
  theme,
  children,
}: {
  label: string;
  theme: Theme;
  children: React.ReactNode;
}) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.section}>
      <Text variant="label" color={theme.color.inkTertiary} style={styles.sectionLabel}>
        {label}
      </Text>
      {children}
    </View>
  );
}

function Row({ k, v, theme, mono }: { k: string; v: string; theme: Theme; mono?: boolean }) {
  const styles = useMemo(() => makeStyles(theme), [theme]);
  return (
    <View style={styles.row}>
      <Text variant="body" color={theme.color.inkSecondary}>
        {k}
      </Text>
      <Text variant={mono ? 'numeral' : 'body'} color={theme.color.ink}>
        {v}
      </Text>
    </View>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    intro: { marginBottom: theme.space.s4 },
    content: { maxHeight: 380 },
    section: {
      paddingVertical: theme.space.s3,
      borderTopWidth: theme.depth.rule,
      borderTopColor: theme.color.border,
    },
    sectionLabel: { marginBottom: theme.space.s2 },
    previewBlock: { marginTop: theme.space.s2, gap: theme.space.half },
    previewRow: { paddingVertical: theme.space.half },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingVertical: theme.space.s1,
    },
  });
