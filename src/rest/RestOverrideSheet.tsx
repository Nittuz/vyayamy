import { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/ui/Button';
import { haptics } from '@/ui/haptics';
import { Plate } from '@/ui/Plate';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

import { restForMuscleGroup } from './defaults';
import { clearOverride, setOverride } from './overrides';

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
  const styles = useMemo(() => makeStyles(theme), [theme]);
  const defaultSeconds = restForMuscleGroup(muscleGroup);
  const [selected, setSelected] = useState<number>(currentOverride ?? defaultSeconds);
  const [customText, setCustomText] = useState<string>('');

  const handleSave = async () => {
    haptics.light();
    const fromCustom = customText.trim() === '' ? null : Number(customText);
    const valueToSave =
      fromCustom != null && Number.isFinite(fromCustom) && fromCustom > 0
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
    <Sheet
      visible={visible}
      onClose={onClose}
      title={`Rest for ${exerciseName}`}
      footer={
        <>
          <Button label="Save" kind="primary" size="row" onPress={() => void handleSave()} />
          {currentOverride != null ? (
            <Button
              label="Reset to default"
              kind="danger"
              size="row"
              onPress={() => void handleReset()}
            />
          ) : null}
          <Button label="Close" kind="ghost" size="row" onPress={onClose} />
        </>
      }
    >
      <Text variant="body" color={theme.color.inkSecondary}>
        Default for {muscleGroup ?? 'this'}: {defaultSeconds}s
      </Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chipRow}
      >
        {PRESETS.map((preset) => {
          const isSelected = selected === preset && customText.trim() === '';
          return (
            // Selection is inversion, never volt: chalk-on-black chip when
            // current, ghost + hairline when available (Blacktop semantics).
            <Plate
              key={preset}
              tone={isSelected ? 'inverted' : 'ghost'}
              border={isSelected ? 'none' : 'soft'}
              radius="sm"
              onPress={() => {
                haptics.light();
                setSelected(preset);
                setCustomText('');
              }}
              accessibilityState={{ selected: isSelected }}
              faceStyle={styles.chipFace}
            >
              {/* One chip idiom: card label (matches TemplatePill). */}
              <Text variant="card" color={isSelected ? theme.color.bg : theme.color.ink}>
                {preset}s
              </Text>
            </Plate>
          );
        })}
      </ScrollView>
      <View style={styles.customRow}>
        <Text variant="strip" color={theme.color.inkTertiary}>
          Custom
        </Text>
        <TextInput
          value={customText}
          onChangeText={setCustomText}
          keyboardType="number-pad"
          placeholder="seconds"
          placeholderTextColor={theme.color.inkTertiary}
          style={styles.input}
        />
      </View>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    chipRow: {
      gap: theme.space.s2,
      paddingVertical: theme.space.s2,
      marginTop: theme.space.s2,
    },
    chipFace: {
      minHeight: theme.touch.min,
      justifyContent: 'center',
      paddingHorizontal: theme.space.s4,
    },
    customRow: {
      marginTop: theme.space.s4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: theme.space.s3,
    },
    input: {
      flex: 1,
      height: theme.touch.min,
      backgroundColor: theme.color.bg,
      borderWidth: theme.depth.hairline,
      borderColor: theme.color.border,
      borderRadius: theme.radius.sm,
      paddingHorizontal: theme.space.s3,
      color: theme.color.ink,
      fontFamily: theme.font.family.mono,
      fontSize: theme.font.size.body,
    },
  });
