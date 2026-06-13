import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useExercisesSearch } from '@/queries/exercises';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

interface Props {
  userId: string;
  visible: boolean;
  onClose: () => void;
  onPick: (exerciseId: string) => void;
}

function useDebouncedValue(value: string, delayMs: number): string {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return debounced;
}

export function ExercisePicker({ userId, visible, onClose, onPick }: Props) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data, isLoading } = useExercisesSearch(userId, debouncedQuery);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  return (
    <Sheet visible={visible} onClose={onClose} title="Add exercise" variant="bottom" dismissable>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search"
        placeholderTextColor={theme.color.inkTertiary}
        autoFocus
        style={styles.search}
      />
      {isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={data ?? []}
          keyExtractor={(it) => it.id}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          renderItem={({ item }) => (
            <Pressable
              onPress={() => {
                onPick(item.id);
                setQuery('');
              }}
              style={({ pressed }) => [styles.row, pressed && styles.rowPressed]}
            >
              <View style={styles.rowBody}>
                <Text variant="card" color={theme.color.ink}>
                  {item.name}
                </Text>
                {item.muscle_group ? (
                  <Text variant="meta" color={theme.color.inkSecondary} style={styles.rowMuscle}>
                    {item.muscle_group}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    search: {
      height: theme.touch.min,
      borderRadius: theme.radius.sm,
      borderWidth: theme.depth.rule,
      borderColor: theme.color.border,
      backgroundColor: theme.color.bg,
      paddingHorizontal: theme.space.s4,
      fontFamily: theme.font.family.sans,
      fontSize: theme.font.size.body,
      color: theme.color.ink,
      marginBottom: theme.space.s3,
    },
    loader: { marginTop: theme.space.s6 },
    list: { maxHeight: 360 },
    row: {
      minHeight: theme.touch.min,
      justifyContent: 'center',
      paddingVertical: theme.space.s3,
      borderBottomWidth: theme.depth.rule,
      borderBottomColor: theme.color.border,
    },
    rowPressed: { opacity: 0.7 },
    rowBody: { flex: 1 },
    rowMuscle: { marginTop: theme.space.s1 },
  });
