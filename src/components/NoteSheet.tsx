/**
 * NoteSheet — session-capture notes (spec 2026-08-09-session-capture).
 *
 * One quiet entry point, one sheet: a multiline session note ("low energy,
 * no carbs") and, when an exercise is in play, a second multiline note for it
 * ("grip slipped"). The exercise prop is a SNAPSHOT taken when the sheet was
 * opened — the parent must not re-point it at whatever the cursor moved to,
 * or typed text would save onto the wrong exercise.
 *
 * Save semantics (all review-driven):
 * - Only fields the user actually edited are written, diffed against the
 *   BASELINE the draft was seeded from (not the live prop) — an untouched
 *   field can never clobber a value that arrived from another device.
 * - Dismissing the sheet (backdrop / back) SAVES: notes are low-stakes
 *   capture, and silently dropping typed text is worse than keeping it.
 * - If the sheet unmounts while open (a screen-branch flip mid-typing, e.g.
 *   a voice "finish"), unsaved changes are flushed instead of lost.
 * Empty text clears a note (stored as NULL).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollView, StyleSheet, TextInput, View } from 'react-native';

import { Button } from '@/ui/Button';
import { haptics } from '@/ui/haptics';
import { Sheet } from '@/ui/Sheet';
import { Text } from '@/ui/Text';
import { useTheme, type Theme } from '@/ui/useTheme';

export interface NoteChanges {
  sessionNote?: string | null;
  exerciseNote?: string | null;
}

interface Props {
  visible: boolean;
  /** Current stored session note (null = none). */
  sessionNote: string | null;
  /** Snapshot of the exercise being annotated; omit for session-only. */
  exercise?: { weId: string; name: string; note: string | null } | null;
  /** Called with the fields the user changed (may be empty = just close). */
  onSave: (changes: NoteChanges) => void;
  saving?: boolean;
}

export function NoteSheet({ visible, sessionNote, exercise, onSave, saving }: Props) {
  const theme = useTheme();
  const styles = useMemo(() => makeStyles(theme), [theme]);

  const [sessionDraft, setSessionDraft] = useState(sessionNote ?? '');
  const [sessionBase, setSessionBase] = useState(sessionNote ?? '');
  const [exerciseDraft, setExerciseDraft] = useState(exercise?.note ?? '');
  const [exerciseBase, setExerciseBase] = useState(exercise?.note ?? '');

  // Re-seed drafts AND baselines each time the sheet opens. Deps are limited
  // to `visible` on purpose (EditSetSheet precedent): a background sync while
  // the user is typing must not wipe the field.
  useEffect(() => {
    if (visible) {
      setSessionDraft(sessionNote ?? '');
      setSessionBase(sessionNote ?? '');
      setExerciseDraft(exercise?.note ?? '');
      setExerciseBase(exercise?.note ?? '');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const computeChanges = (): NoteChanges => {
    const changes: NoteChanges = {};
    if (sessionDraft !== sessionBase) changes.sessionNote = sessionDraft;
    if (exercise && exerciseDraft !== exerciseBase) changes.exerciseNote = exerciseDraft;
    return changes;
  };

  const handleSave = () => {
    haptics.light();
    onSave(computeChanges());
  };

  // Unmount flush: latest-state ref so the cleanup sees current drafts.
  const flushRef = useRef({ visible, computeChanges, onSave });
  flushRef.current = { visible, computeChanges, onSave };
  useEffect(
    () => () => {
      const f = flushRef.current;
      if (!f.visible) return;
      const changes = f.computeChanges();
      if (Object.keys(changes).length > 0) f.onSave(changes);
    },
    [],
  );

  return (
    <Sheet
      visible={visible}
      onClose={handleSave}
      title="Notes"
      footer={
        <Button
          label="Save"
          size="cta"
          loading={saving}
          onPress={handleSave}
          accessibilityLabel="Save notes"
        />
      }
    >
      {/* Sheet callers own scrolling; two multiline fields + keyboard can
          overflow the 80% max height on small screens. */}
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.body}>
        <View style={styles.field}>
          <Text variant="label" color={theme.color.inkTertiary}>
            Session
          </Text>
          <TextInput
            value={sessionDraft}
            onChangeText={setSessionDraft}
            multiline
            placeholder="How did it go? Energy, sleep, food…"
            placeholderTextColor={theme.color.inkTertiary}
            accessibilityLabel="Session note"
            style={[
              styles.input,
              {
                color: theme.color.ink,
                borderColor: theme.color.border,
                fontFamily: theme.font.family.sans,
              },
            ]}
          />
        </View>
        {exercise ? (
          <View style={styles.field}>
            <Text variant="label" color={theme.color.inkTertiary} numberOfLines={1}>
              {exercise.name}
            </Text>
            <TextInput
              value={exerciseDraft}
              onChangeText={setExerciseDraft}
              multiline
              placeholder="Anything about this exercise…"
              placeholderTextColor={theme.color.inkTertiary}
              accessibilityLabel={`Note for ${exercise.name}`}
              style={[
                styles.input,
                {
                  color: theme.color.ink,
                  borderColor: theme.color.border,
                  fontFamily: theme.font.family.sans,
                },
              ]}
            />
          </View>
        ) : null}
      </ScrollView>
    </Sheet>
  );
}

const makeStyles = (theme: Theme) =>
  StyleSheet.create({
    body: { gap: theme.space.s4, paddingBottom: theme.space.s2 },
    field: { gap: theme.space.s2 },
    input: {
      minHeight: 72,
      borderWidth: theme.depth.hairline,
      paddingHorizontal: theme.space.s3,
      paddingVertical: theme.space.s3,
      fontSize: theme.font.size.body,
      textAlignVertical: 'top',
    },
  });
