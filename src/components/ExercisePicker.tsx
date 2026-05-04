import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';

import { useExercisesSearch } from '@/queries/exercises';
import { theme } from '@/ui/theme';

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

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <Text style={styles.title}>Add exercise</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={theme.color.textTertiary}
          autoFocus
          style={styles.search}
        />
        {isLoading ? (
          <ActivityIndicator style={{ marginTop: theme.space.s6 }} />
        ) : (
          <FlatList
            data={data ?? []}
            keyExtractor={(it) => it.id}
            ItemSeparatorComponent={() => <View style={styles.sep} />}
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  onPick(item.id);
                  setQuery('');
                }}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.7 }]}
              >
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{item.name}</Text>
                  {item.muscle_group ? (
                    <Text style={styles.rowMuscle}>{item.muscle_group}</Text>
                  ) : null}
                </View>
              </Pressable>
            )}
          />
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFillObject, backgroundColor: theme.color.overlay },
  sheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    maxHeight: '80%',
    backgroundColor: theme.color.surface,
    borderTopLeftRadius: theme.radius.lg,
    borderTopRightRadius: theme.radius.lg,
    paddingHorizontal: theme.space.s5,
    paddingBottom: theme.space.s8,
    paddingTop: theme.space.s3,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: theme.color.borderStrong,
    marginBottom: theme.space.s3,
  },
  title: {
    fontSize: theme.font.section,
    fontWeight: theme.font.weight.semibold,
    color: theme.color.text,
    marginBottom: theme.space.s3,
  },
  search: {
    height: 44,
    borderRadius: theme.radius.sm,
    backgroundColor: theme.color.bg,
    paddingHorizontal: theme.space.s4,
    fontSize: theme.font.body,
    color: theme.color.text,
    marginBottom: theme.space.s3,
  },
  row: { paddingVertical: theme.space.s3 },
  rowTitle: { fontSize: theme.font.body, color: theme.color.text },
  rowMuscle: {
    fontSize: theme.font.meta,
    color: theme.color.textSecondary,
    marginTop: theme.space.s1,
  },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.color.border },
});
