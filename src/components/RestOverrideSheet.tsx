import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import { restForMuscleGroup } from '@/ui/restDefaults';
import { clearOverride, setOverride } from '@/ui/restOverrides';
import { useTheme } from '@/ui/useTheme';
import { haptics } from '@/ui/haptics';

interface Props {
  visible: boolean;
  exerciseId: string;
  exerciseName: string;
  muscleGroup: string | null;
  currentOverride: number | null; // null = no override (using default)
  onClose: () => void;
  onChanged: () => void; // invalidate / refresh after save
}

const PRESETS = [30, 60, 90, 120, 180, 240, 300];

export function RestOverrideSheet({
  visible,
  exerciseId,
  exerciseName,
  muscleGroup,
  currentOverride,
  onClose,
  onChanged,
}: Props) {
  const theme = useTheme();
  const defaultSeconds = restForMuscleGroup(muscleGroup);
  const [selected, setSelected] = useState<number>(currentOverride ?? defaultSeconds);
  const [customText, setCustomText] = useState<string>('');

  const handleSave = async () => {
    haptics.light();
    const fromCustom = customText.trim() === '' ? null : Number(customText);
    const valueToSave = fromCustom != null && Number.isFinite(fromCustom) && fromCustom > 0
      ? Math.floor(fromCustom)
      : selected;
    await setOverride(exerciseId, valueToSave);
    onChanged();
    onClose();
  };

  const handleReset = async () => {
    haptics.medium();
    await clearOverride(exerciseId);
    onChanged();
    onClose();
  };

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
            Rest for {exerciseName}
          </Text>
          <Text
            style={[
              styles.body,
              { color: theme.color.inkSecondary, fontFamily: theme.font.family.sans },
            ]}
          >
            Default for {muscleGroup ?? 'this'}: {defaultSeconds}s
          </Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chipRow}>
            {PRESETS.map((preset) => {
              const isSelected = selected === preset && customText.trim() === '';
              return (
                <Pressable
                  key={preset}
                  onPress={() => {
                    haptics.light();
                    setSelected(preset);
                    setCustomText('');
                  }}
                  style={({ pressed }) => [
                    styles.chip,
                    {
                      backgroundColor: isSelected ? theme.color.accent : 'transparent',
                      borderColor: isSelected ? theme.color.accent : theme.color.borderStrong,
                      opacity: pressed ? 0.7 : 1,
                    },
                  ]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      {
                        color: isSelected ? theme.color.onAccent : theme.color.ink,
                        fontFamily: theme.font.family.mono,
                      },
                    ]}
                  >
                    {preset}s
                  </Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <View style={styles.customRow}>
            <Text
              style={[
                styles.label,
                { color: theme.color.inkTertiary, fontFamily: theme.font.family.sansMedium },
              ]}
            >
              CUSTOM
            </Text>
            <TextInput
              value={customText}
              onChangeText={setCustomText}
              keyboardType="number-pad"
              placeholder="seconds"
              placeholderTextColor={theme.color.inkTertiary}
              style={[
                styles.input,
                {
                  borderColor: theme.color.borderStrong,
                  color: theme.color.ink,
                  fontFamily: theme.font.family.mono,
                },
              ]}
            />
          </View>
          <View style={styles.actions}>
            <Pressable
              onPress={() => void handleSave()}
              style={({ pressed }) => [
                styles.saveBtn,
                { backgroundColor: theme.color.accent, opacity: pressed ? 0.85 : 1 },
              ]}
            >
              <Text
                style={[
                  styles.saveText,
                  { color: theme.color.onAccent, fontFamily: theme.font.family.sansSemibold },
                ]}
              >
                Save
              </Text>
            </Pressable>
            {currentOverride != null ? (
              <Pressable
                onPress={() => void handleReset()}
                style={({ pressed }) => [styles.resetBtn, { opacity: pressed ? 0.5 : 1 }]}
              >
                <Text
                  style={[
                    styles.resetText,
                    { color: theme.color.danger, fontFamily: theme.font.family.sansMedium },
                  ]}
                >
                  Reset to default
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

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: 'flex-end' },
  sheet: {
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    paddingHorizontal: 20,
    paddingTop: 24,
    paddingBottom: 32,
  },
  title: { marginBottom: 8 },
  body: { fontSize: 13, marginBottom: 16, lineHeight: 19 },
  chipRow: { gap: 8, paddingVertical: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 8,
    borderWidth: 1,
  },
  chipText: { fontSize: 13 },
  customRow: { marginTop: 16, flexDirection: 'row', alignItems: 'center', gap: 12 },
  label: { fontSize: 10, letterSpacing: 1.5, textTransform: 'uppercase' },
  input: {
    flex: 1,
    borderWidth: 1,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
  },
  actions: { marginTop: 20, gap: 8 },
  saveBtn: { paddingVertical: 14, borderRadius: 10, alignItems: 'center' },
  saveText: { fontSize: 14 },
  resetBtn: { paddingVertical: 12, alignItems: 'center' },
  resetText: { fontSize: 12 },
  closeBtn: { paddingVertical: 10, alignItems: 'center' },
  closeText: { fontSize: 12 },
});
