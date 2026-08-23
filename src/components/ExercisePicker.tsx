import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { useCreateCustomExercise, useExercisesSearch } from '@/queries/exercises';
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
  const [createError, setCreateError] = useState<string | null>(null);
  const debouncedQuery = useDebouncedValue(query, 300);
  const { data, isLoading } = useExercisesSearch(userId, debouncedQuery);
  const createExercise = useCreateCustomExercise(setCreateError);
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  useEffect(() => setCreateError(null), [query]);

  const trimmed = query.trim();
  const results = data ?? [];
  const exactMatch =
    trimmed.length > 0 &&
    results.some((e) => e.name.trim().toLowerCase() === trimmed.toLowerCase());

  const handlePick = (exerciseId: string) => {
    onPick(exerciseId);
    setQuery('');
  };

  const handleCreate = async () => {
    if (createExercise.isPending || trimmed.length === 0) return;
    setCreateError(null);
    try {
      const id = await createExercise.mutateAsync({ userId, name: trimmed });
      handlePick(id);
    } catch {
      // Friendly copy already set through the mutation's onError callback.
    }
  };

  // Create-from-picker (backlog 1.3): voice used to be the only way to make a
  // custom exercise. The row appears whenever the typed name has no exact
  // match, both under results and as the empty state.
  const createRow = (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Create ${trimmed}`}
      accessibilityHint="Adds it to your exercise library and picks it"
      accessibilityState={{ disabled: createExercise.isPending, busy: createExercise.isPending }}
      disabled={createExercise.isPending}
      onPress={() => void handleCreate()}
      style={({ pressed }) => [styles.row, pressed && styles.rowInverted]}
    >
      {({ pressed }) =>
        createExercise.isPending ? (
          <ActivityIndicator color={theme.color.ink} />
        ) : (
          <Text variant="card" color={pressed ? theme.color.bg : theme.color.accent}>
            + Create {trimmed}
          </Text>
        )
      }
    </Pressable>
  );

  return (
    <Sheet visible={visible} onClose={onClose} title="Add exercise" variant="bottom" dismissable>
      <TextInput
        value={query}
        onChangeText={setQuery}
        placeholder="Search, or type to create"
        placeholderTextColor={theme.color.inkTertiary}
        autoFocus
        // Synthesized: this field has no adjacent visible label (sheet title +
        // placeholder only), so the label names both jobs the field does.
        accessibilityLabel="Search or create exercise"
        style={styles.search}
      />
      {createError ? (
        <Text variant="meta" color={theme.color.danger} style={styles.createError}>
          {createError}
        </Text>
      ) : null}
      {isLoading ? (
        <ActivityIndicator style={styles.loader} />
      ) : (
        <FlatList
          data={results}
          keyExtractor={(it) => it.id}
          style={styles.list}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            trimmed.length > 0 ? (
              createRow
            ) : (
              <Text variant="body" color={theme.color.inkSecondary} style={styles.empty}>
                No exercises yet. Type a name to create one.
              </Text>
            )
          }
          ListFooterComponent={
            results.length > 0 && !exactMatch && trimmed.length > 0 ? createRow : null
          }
          renderItem={({ item }) => (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={
                item.muscle_group ? `${item.name}, ${item.muscle_group}` : item.name
              }
              onPress={() => handlePick(item.id)}
              style={({ pressed }) => [styles.row, pressed && styles.rowInverted]}
            >
              {({ pressed }) => (
                <View style={styles.rowBody}>
                  <Text variant="card" color={pressed ? theme.color.bg : theme.color.ink}>
                    {item.name}
                  </Text>
                  {item.muscle_group ? (
                    <Text
                      variant="strip"
                      color={pressed ? theme.color.bg : theme.color.inkTertiary}
                      style={styles.rowMeta}
                    >
                      {item.muscle_group}
                    </Text>
                  ) : null}
                </View>
              )}
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
      borderWidth: theme.depth.hairline,
      borderColor: theme.color.border,
      backgroundColor: theme.color.bg,
      paddingHorizontal: theme.space.s4,
      fontFamily: theme.font.family.sans,
      fontSize: theme.font.size.body,
      color: theme.color.ink,
      marginBottom: theme.space.s3,
    },
    createError: { marginBottom: theme.space.s2 },
    loader: { marginTop: theme.space.s6 },
    list: { maxHeight: 360 },
    row: {
      minHeight: theme.touch.min,
      justifyContent: 'center',
      paddingVertical: theme.space.s3,
      paddingHorizontal: theme.space.s2,
      borderBottomWidth: theme.depth.hairline,
      borderBottomColor: theme.color.border,
    },
    // Press feedback is inversion (the Blacktop selection semantic), not a dim.
    rowInverted: {
      backgroundColor: theme.color.ink,
      borderBottomColor: theme.color.ink,
    },
    rowBody: { flex: 1 },
    // Muscle-group meta rides the standard strip treatment.
    rowMeta: { marginTop: theme.space.s1 },
    empty: { paddingVertical: theme.space.s6, textAlign: 'center' },
  });
