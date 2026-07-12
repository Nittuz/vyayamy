import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ageLabel } from '@/core/format';
import {
  type QuarantinedRow,
  discardAllQuarantined,
  discardQuarantinedRow,
  retryAllQuarantined,
  retryQuarantinedRow,
  summarizeRow,
} from '@/sync/quarantine';
import { Button } from '@/ui/Button';
import { ConfirmSheet } from '@/ui/ConfirmSheet';
import { Plate } from '@/ui/Plate';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { haptics } from '@/ui/haptics';
import { useTheme, type Theme } from '@/ui/useTheme';

interface Props {
  visible: boolean;
  rows: QuarantinedRow[];
  onClose: () => void;
  onChanged: () => void; // invalidate the query after a mutation
}

export function QuarantineSheet({ visible, rows, onClose, onChanged }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [confirmDiscardAll, setConfirmDiscardAll] = useState(false);

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
    <>
      <Sheet
        visible={visible}
        onClose={onClose}
        title="Stuck syncs"
        footer={
          <>
            <Button
              label="Retry all"
              kind="primary"
              size="row"
              onPress={() => void handleRetryAll()}
            />
            <Button
              label="Discard all"
              kind="danger"
              size="row"
              onPress={() => setConfirmDiscardAll(true)}
            />
            <Button label="Close" kind="ghost" size="row" onPress={onClose} />
          </>
        }
      >
        <Text variant="body" color={theme.color.inkSecondary} style={styles.intro}>
          These changes haven't reached the server after multiple tries. Retry sends them back to
          the queue. Discard removes them locally without syncing.
        </Text>
        <ScrollView style={styles.list}>
          {rows.map((r) => (
            <Plate key={r.id} tone="ghost" faceStyle={styles.rowFace}>
              <Text variant="numeral" color={theme.color.ink}>
                {summarizeRow(r)}
              </Text>
              <Text variant="strip" color={theme.color.inkTertiary}>
                {ageLabel(r.created_at)} · {r.attempts} TRIES
              </Text>
              {r.last_error ? (
                <Text variant="meta" color={theme.color.danger}>
                  {r.last_error}
                </Text>
              ) : null}
              <View style={styles.rowActions}>
                <Button
                  label="Retry"
                  kind="secondary"
                  size="row"
                  onPress={() => void handleRetry(r.id)}
                  style={styles.rowAction}
                />
                <Button
                  label="Discard"
                  kind="danger"
                  size="row"
                  onPress={() => void handleDiscard(r.id)}
                  style={styles.rowAction}
                />
              </View>
            </Plate>
          ))}
        </ScrollView>
      </Sheet>
      <ConfirmSheet
        visible={confirmDiscardAll}
        onClose={() => setConfirmDiscardAll(false)}
        title="Discard all quarantined sets?"
        message="This removes them locally without syncing. This can't be undone."
        confirmLabel="Discard all"
        destructive
        onConfirm={() => void handleDiscardAll()}
      />
    </>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    intro: { marginBottom: theme.space.s4 },
    list: { flexGrow: 0, maxHeight: 360 },
    rowFace: {
      paddingVertical: theme.space.s3,
      gap: theme.space.s2,
      borderBottomWidth: theme.depth.hairline,
      borderBottomColor: theme.color.border,
    },
    rowActions: { flexDirection: 'row', gap: theme.space.s2, marginTop: theme.space.s1 },
    rowAction: { flex: 1 },
  });
