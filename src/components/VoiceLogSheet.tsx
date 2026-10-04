/**
 * VoiceLogSheet — the voice diagnostics log (src/voice/voiceLog.ts) as a
 * scrollable, selectable mono transcript with Share and Clear. Live: it
 * re-renders on every appended entry, so a session can be watched as it
 * happens. Caller owns visibility, same idiom as VoiceHelpSheet.
 */
import { useEffect, useMemo, useState } from 'react';
import { ScrollView, Share, StyleSheet, View } from 'react-native';

import { Button } from '@/ui/Button';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';
import { clearVoiceLog, formatVoiceLog, getVoiceLog, subscribeVoiceLog } from '@/voice/voiceLog';

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function VoiceLogSheet({ visible, onClose }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const [, bump] = useState(0);
  useEffect(() => subscribeVoiceLog(() => bump((n) => n + 1)), []);
  const text = formatVoiceLog(getVoiceLog());

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Voice log"
      maxHeightPct={0.85}
      footer={
        <View style={styles.actions}>
          <Button
            label="Share log"
            kind="secondary"
            size="row"
            disabled={text.length === 0}
            onPress={() => void Share.share({ message: text })}
          />
          <Button label="Clear" kind="ghost" size="row" onPress={clearVoiceLog} />
        </View>
      }
    >
      <ScrollView contentContainerStyle={styles.body}>
        {text ? (
          <Text variant="strip" color={theme.color.ink} selectable style={styles.mono}>
            {text}
          </Text>
        ) : (
          <Text variant="meta" color={theme.color.inkTertiary}>
            Nothing yet. Hold or tap the mic, then come back.
          </Text>
        )}
      </ScrollView>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { paddingBottom: theme.space.s2 },
    mono: { textTransform: 'none', letterSpacing: 0 },
    actions: { gap: theme.space.s2 },
  });
