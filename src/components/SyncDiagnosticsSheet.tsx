import { useEffect, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { useQuarantined } from '@/sync/quarantine';
import { runSyncCycle } from '@/sync/engine';
import { getOutboxPreview, relativeAge, type OutboxPreviewRow } from '@/sync/outboxPreview';
import { useSyncStateLive } from '@/sync/useSyncStateLive';
import { haptics } from '@/ui/haptics';
import { useTheme } from '@/ui/useTheme';

interface Props {
  visible: boolean;
  onClose: () => void;
  onOpenQuarantine: () => void;
}

export function SyncDiagnosticsSheet({ visible, onClose, onOpenQuarantine }: Props) {
  const theme = useTheme();
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

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={[styles.backdrop, { backgroundColor: theme.color.overlay }]} onPress={onClose}>
        <Pressable
          style={[styles.sheet, { backgroundColor: theme.color.bg }]}
          onPress={(e) => e.stopPropagation()}
        >
          <Text
            style={[
              styles.title,
              {
                color: theme.color.inkHero,
                fontFamily: theme.font.family.sansSemibold,
                fontSize: theme.font.size.title,
                letterSpacing: theme.font.tracking.title,
              },
            ]}
          >
            Sync diagnostics
          </Text>
          <Text
            style={[
              styles.body,
              { color: theme.color.inkSecondary, fontFamily: theme.font.family.sans },
            ]}
          >
            Read-only view of the sync engine's state.
          </Text>

          <ScrollView style={styles.content}>
            <Section label="STATUS" theme={theme}>
              <Row k="State" v={statusLabel} theme={theme} mono />
              <Row k="Last error" v={sync.lastError ?? 'none'} theme={theme} mono />
            </Section>

            <Section label="OUTBOX" theme={theme}>
              <Row k="Pending" v={String(sync.pendingOutbox)} theme={theme} mono />
              <Row k="Quarantined" v={String(quarantined.data?.length ?? 0)} theme={theme} mono />
              {preview.length > 0 ? (
                <View style={{ marginTop: 8 }}>
                  <Text
                    style={[
                      styles.smallLabel,
                      { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
                    ]}
                  >
                    MOST RECENT
                  </Text>
                  {preview.map((row) => (
                    <Text
                      key={row.id}
                      style={[
                        styles.previewRow,
                        { color: theme.color.ink, fontFamily: theme.font.family.mono },
                      ]}
                    >
                      {row.table_name} · {row.op} · {relativeAge(row.created_at)}
                    </Text>
                  ))}
                </View>
              ) : null}
            </Section>

            <Section label="LAST SYNC" theme={theme}>
              <Row k="Pushed" v={sync.lastPushedAt ? relativeAge(sync.lastPushedAt) : 'never'} theme={theme} mono />
              <Row k="Pulled" v={sync.lastPulledAt ? relativeAge(sync.lastPulledAt) : 'never'} theme={theme} mono />
            </Section>
          </ScrollView>

          <View style={styles.actions}>
            <Pressable
              onPress={() => void handleForceSync()}
              disabled={syncingNow}
              style={({ pressed }) => [
                styles.forceBtn,
                {
                  backgroundColor: theme.color.accent,
                  opacity: pressed ? 0.85 : syncingNow ? 0.5 : 1,
                },
              ]}
            >
              <Text style={[styles.forceText, { color: theme.color.onAccent, fontFamily: theme.font.family.sansSemibold }]}>
                {syncingNow ? 'Syncing…' : 'Force sync now'}
              </Text>
            </Pressable>
            {(quarantined.data?.length ?? 0) > 0 ? (
              <Pressable
                onPress={onOpenQuarantine}
                style={({ pressed }) => [styles.linkBtn, { opacity: pressed ? 0.7 : 1 }]}
              >
                <Text style={[styles.linkText, { color: theme.color.danger, fontFamily: theme.font.family.sansMedium }]}>
                  Review quarantined ({quarantined.data?.length ?? 0})
                </Text>
              </Pressable>
            ) : null}
            <Pressable onPress={onClose} style={styles.closeBtn}>
              <Text style={[styles.closeText, { color: theme.color.inkSecondary, fontFamily: theme.font.family.sansMedium }]}>
                Close
              </Text>
            </Pressable>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function Section({ label, theme, children }: { label: string; theme: ReturnType<typeof useTheme>; children: React.ReactNode }) {
  return (
    <View style={[styles.section, { borderColor: theme.color.border }]}>
      <Text
        style={[
          styles.sectionLabel,
          { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
        ]}
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function Row({ k, v, theme, mono }: { k: string; v: string; theme: ReturnType<typeof useTheme>; mono?: boolean }) {
  return (
    <View style={styles.row}>
      <Text style={[styles.rowKey, { color: theme.color.inkSecondary, fontFamily: theme.font.family.sans }]}>
        {k}
      </Text>
      <Text
        style={[
          styles.rowValue,
          {
            color: theme.color.ink,
            fontFamily: mono ? theme.font.family.mono : theme.font.family.sans,
          },
        ]}
      >
        {v}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
    maxHeight: '85%',
  },
  title: { marginBottom: 8 },
  body: { fontSize: 13, marginBottom: 16, lineHeight: 19 },
  content: { maxHeight: 380 },
  section: { paddingVertical: 12, borderTopWidth: StyleSheet.hairlineWidth },
  sectionLabel: {
    fontSize: 10,
    letterSpacing: 1.5,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  smallLabel: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  row: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 4 },
  rowKey: { fontSize: 12 },
  rowValue: { fontSize: 12 },
  previewRow: { fontSize: 11, paddingVertical: 2 },
  actions: { marginTop: 16, gap: 8 },
  forceBtn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  forceText: { fontSize: 14 },
  linkBtn: { paddingVertical: 12, alignItems: 'center' },
  linkText: { fontSize: 13 },
  closeBtn: { paddingVertical: 10, alignItems: 'center' },
  closeText: { fontSize: 12 },
});
