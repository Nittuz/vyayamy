import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput } from 'react-native';

import { useTheme } from '@/ui/useTheme';

interface Props {
  value: string;
  onCommit: (next: string) => void;
}

export function EditableTitle({ value, onCommit }: Props) {
  const theme = useTheme();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);

  const start = useCallback(() => {
    setDraft(value);
    setEditing(true);
  }, [value]);

  const commit = useCallback(() => {
    setEditing(false);
    const trimmed = draft.trim();
    if (trimmed !== '' && trimmed !== value) {
      onCommit(trimmed);
    }
  }, [draft, value, onCommit]);

  if (editing) {
    return (
      <TextInput
        value={draft}
        onChangeText={setDraft}
        onBlur={commit}
        onSubmitEditing={commit}
        autoFocus
        returnKeyType="done"
        style={[
          styles.input,
          {
            color: theme.color.ink,
            fontFamily: theme.font.family.sansMedium,
          },
        ]}
      />
    );
  }

  return (
    <Pressable
      onPress={start}
      hitSlop={8}
      accessibilityRole="button"
      accessibilityLabel="Edit title"
    >
      <Text
        style={[
          styles.text,
          {
            color: theme.color.ink,
            fontFamily: theme.font.family.sansMedium,
          },
        ]}
      >
        {value.toLowerCase()}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  text: {
    fontSize: 14,
    letterSpacing: -0.1,
  },
  input: {
    fontSize: 14,
    letterSpacing: -0.1,
    minWidth: 100,
    paddingVertical: 0,
  },
});
