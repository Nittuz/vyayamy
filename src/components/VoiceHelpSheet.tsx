/**
 * VoiceHelpSheet — "what can I say" reference for the voice grammar
 * (impeccable batch 2, task 3). Pure presentational: the caller owns the
 * open/close state and mounts it, same idiom as NoteSheet/RestOverrideSheet.
 *
 * Groups + phrasing are copied verbatim from src/voice/grammar.ts — keep
 * this list in sync if the grammar's recognized phrasing changes.
 */
import { useMemo } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

interface Group {
  label: string;
  examples: string[];
}

const GROUPS: Group[] = [
  { label: 'Log a set', examples: ['80 for 5', '12 reps at 60', '15 reps'] },
  { label: 'Complete', examples: ['Done', 'Next set'] },
  {
    label: 'Exercises',
    examples: ['Add a set', 'Add bench press', 'Next exercise', 'Previous exercise'],
  },
  { label: 'Rest', examples: ['Start rest', 'Rest two minutes', 'Skip rest'] },
  { label: 'Session', examples: ['Finish workout', 'Undo', 'Stop listening'] },
];

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function VoiceHelpSheet({ visible, onClose }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Voice commands">
      <ScrollView contentContainerStyle={styles.body}>
        {GROUPS.map((group) => (
          <View key={group.label} style={styles.group}>
            <Text variant="strip" color={theme.color.inkTertiary}>
              {group.label}
            </Text>
            <View style={styles.examples}>
              {group.examples.map((example) => (
                <Text key={example} variant="body" color={theme.color.ink}>
                  “{example}”
                </Text>
              ))}
            </View>
          </View>
        ))}
      </ScrollView>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: theme.space.s6, paddingBottom: theme.space.s2 },
    group: { gap: theme.space.s2 },
    examples: { gap: theme.space.s2 },
  });
