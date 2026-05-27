import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  type QuarantinedRow,
  discardAllQuarantined,
  discardQuarantinedRow,
  retryAllQuarantined,
  retryQuarantinedRow,
  summarizeRow,
} from '@/sync/quarantine';
import { haptics } from '@/ui/haptics';
import { useTheme } from '@/ui/useTheme';

interface Props {
  visible: boolean;
  rows: QuarantinedRow[];
  onClose: () => void;
  onChanged: () => void; // invalidate the query after a mutation
}

export function QuarantineSheet({ visible, rows, onClose, onChanged }: Props) {
  const theme = useTheme();

  const handleRetry = async (id: number) => {
    haptics.light();
    await retryQuarantinedRow(id);
    onChanged();
  };
  const handleDiscard = async (id: number) => {
    haptics.medium();
    await discardQuarantinedRow(id);
    onChanged();
  };
  const handleRetryAll = async () => {
    haptics.medium();
    await retryAllQuarantined();
    onChanged();
  };
  const handleDiscardAll = async () => {
    haptics.medium();
    await discardAllQuarantined();
    onChanged();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={[styles.backdrop, { backgroundColor: theme.color.overlay }]}
        onPress={onClose}
      >
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
            Stuck syncs
          </Text>
          <Text
            style={[
              styles.body,
              { color: theme.color.inkSecondary, fontFamily: theme.font.family.sans },
            ]}
          >
            These changes haven't reached the server after multiple tries.
            Retry sends them back to the queue. Discard removes them locally
            without syncing.
          </Text>
          <ScrollView style={styles.list}>
            {rows.map((r) => (
              <View
                key={r.id}
                style={[styles.row, { borderColor: theme.color.border }]}
              >
                <Text
                  style={[
                    styles.rowSummary,
                    {
                      color: theme.color.ink,
                      fontFamily: theme.font.family.mono,
                    },
                  ]}
                >
                  {summarizeRow(r)}
                </Text>
                <Text
                  style={[
                    styles.rowMeta,
                    {
                      color: theme.color.inkTertiary,
                      fontFamily: theme.font.family.sansMedium,
                    },
                  ]}
                >
                  CREATED {ageLabel(r.created_at)} · {r.attempts} tries
                </Text>
                {r.last_error ? (
                  <Text
                    style={[
                      styles.rowError,
                      { color: theme.color.danger, fontFamily: theme.font.family.sans },
                    ]}
                  >
                    {r.last_error}
                  </Text>
                ) : null}
                <View style={styles.rowActions}>
                  <Pressable
                    onPress={() => void handleRetry(r.id)}
                    style={({ pressed }) => [
                      styles.actionBtn,
                      { borderColor: theme.color.borderStrong, opacity: pressed ? 0.7 : 1 },
                    ]}
                  >
                    <Text style={[styles.actionText, { color: theme.color.ink, fontFamily: theme.font.family.sansMedium }]}>
                      Retry
                    </Text>
                  </Pressable>
                  <Pressable
                    onPress={() => void handleDiscard(r.id)}
                    style={({ pressed }) => [styles.actionBtn, { opacity: pressed ? 0.5 : 1 }]}
                  >
                    <Text style={[styles.actionText, { color: theme.color.danger, fontFamily: theme.font.family.sansMedium }]}>
                      Discard
                    </Text>
                  </Pressable>
                </View>
              </View>
            ))}
          </ScrollView>
          <View style={styles.footer}>
            <Pressable
              onPress={() => void handleRetryAll()}
              style={({ pressed }) => [
                styles.footerBtn,
                { backgroundColor: theme.color.accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text style={[styles.footerText, { color: theme.color.onAccent, fontFamily: theme.font.family.sansSemibold }]}>
                Retry all
              </Text>
            </Pressable>
            <Pressable
              onPress={() => void handleDiscardAll()}
              style={({ pressed }) => [
                styles.footerBtn,
                styles.footerBtnDanger,
                { borderColor: theme.color.danger, opacity: pressed ? 0.7 : 1 },
              ]}
            >
              <Text style={[styles.footerText, { color: theme.color.danger, fontFamily: theme.font.family.sansSemibold }]}>
                Discard all
              </Text>
            </Pressable>
          </View>
          <Pressable onPress={onClose} style={styles.close}>
            <Text style={[styles.closeText, { color: theme.color.inkSecondary, fontFamily: theme.font.family.sansMedium }]}>
              Close
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

function ageLabel(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const hours = Math.floor(ms / (60 * 60 * 1000));
  if (hours < 24) return `${hours}H AGO`;
  const days = Math.floor(hours / 24);
  return `${days}D AGO`;
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
  body: { fontSize: 13, lineHeight: 19, marginBottom: 16 },
  list: { maxHeight: 360 },
  row: { paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth },
  rowSummary: { fontSize: 14, marginBottom: 4 },
  rowMeta: {
    fontSize: 10,
    letterSpacing: 1.2,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  rowError: { fontSize: 11, marginBottom: 8, fontStyle: 'italic' },
  rowActions: { flexDirection: 'row', gap: 8 },
  actionBtn: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    borderWidth: 1,
  },
  actionText: { fontSize: 12 },
  footer: { flexDirection: 'row', gap: 8, marginTop: 16 },
  footerBtn: { flex: 1, paddingVertical: 12, borderRadius: 8, alignItems: 'center' },
  footerBtnDanger: { backgroundColor: 'transparent', borderWidth: 1 },
  footerText: { fontSize: 13 },
  close: { paddingVertical: 12, alignItems: 'center', marginTop: 4 },
  closeText: { fontSize: 12 },
});
