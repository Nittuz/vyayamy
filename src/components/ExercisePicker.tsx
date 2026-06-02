import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming } from 'react-native-reanimated';
import { motion } from '@/ui/motion';

import { useExercisesSearch } from '@/queries/exercises';
import { useTheme } from '@/ui/useTheme';

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

  const screenHeight = Dimensions.get('window').height;
  const sheetY = useSharedValue(screenHeight);

  useEffect(() => {
    if (visible) {
      sheetY.value = withSpring(0, motion.spring.settle);
    } else {
      sheetY.value = withTiming(screenHeight, { duration: 220 });
    }
  }, [visible, sheetY, screenHeight]);

  const sheetStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: sheetY.value }],
  }));

  const styles = useMemo(() => StyleSheet.create({
    backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: theme.color.overlay },
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
      fontSize: theme.font.size.title,
      fontWeight: theme.font.weight.semibold,
      color: theme.color.ink,
      marginBottom: theme.space.s3,
    },
    search: {
      height: 44,
      borderRadius: theme.radius.sm,
      backgroundColor: theme.color.bg,
      paddingHorizontal: theme.space.s4,
      fontSize: theme.font.size.body,
      color: theme.color.ink,
      marginBottom: theme.space.s3,
    },
    row: { paddingVertical: theme.space.s3 },
    rowTitle: { fontSize: theme.font.size.body, color: theme.color.ink },
    rowMuscle: {
      fontSize: theme.font.size.meta,
      color: theme.color.inkSecondary,
      marginTop: theme.space.s1,
    },
    sep: { height: StyleSheet.hairlineWidth, backgroundColor: theme.color.border },
  }), [theme]);

  return (
    <Modal
      visible={visible}
      animationType="none"
      transparent
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
    >
      <Pressable style={styles.backdrop} onPress={onClose} />
      <Animated.View style={[styles.sheet, sheetStyle]}>
        <View style={styles.handle} />
        <Text style={styles.title}>Add exercise</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search"
          placeholderTextColor={theme.color.inkTertiary}
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
      </Animated.View>
    </Modal>
  );
}
