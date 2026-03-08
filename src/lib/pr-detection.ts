import { supabase } from './supabase';

type SetRow = { weight: number | null; reps: number | null; completed: boolean };
type WorkoutExerciseRow = { exercise_id: string; sets: SetRow[] };

async function upsertPR(
  userId: string,
  exerciseId: string,
  type: string,
  value: unknown,
  achievedAt: string,
  workoutId: string
) {
  await supabase.from('personal_records').upsert(
    {
      user_id: userId,
      exercise_id: exerciseId,
      type,
      value: value as never,
      achieved_at: achievedAt,
      workout_id: workoutId,
    },
    { onConflict: 'user_id,exercise_id,type' }
  );
}

export async function detectAndInsertPRs(
  userId: string,
  workoutId: string,
  workoutExercises: WorkoutExerciseRow[]
): Promise<void> {
  for (const we of workoutExercises) {
    const completedSets = we.sets.filter((s) => s.completed && (s.weight != null || s.reps != null));
    if (completedSets.length === 0) continue;

    let bestWeight: number | null = null;
    let bestVolume = 0;
    let bestRepsAtWeight: { weight: number; reps: number } | null = null;

    for (const s of completedSets) {
      const w = s.weight ?? 0;
      const r = s.reps ?? 0;
      const vol = w * r;
      if (w > 0 && (bestWeight == null || w > bestWeight)) bestWeight = w;
      if (vol > bestVolume) bestVolume = vol;
      if (w > 0 && r > 0 && (bestRepsAtWeight == null || r > bestRepsAtWeight.reps || (r === bestRepsAtWeight.reps && w > bestRepsAtWeight.weight)))
        bestRepsAtWeight = { weight: w, reps: r };
    }

    const { data: existing } = await supabase
      .from('personal_records')
      .select('type, value')
      .eq('user_id', userId)
      .eq('exercise_id', we.exercise_id);

    const existingByType = new Map((existing ?? []).map((r: { type: string; value: unknown }) => [r.type, r.value]));
    const achievedAt = new Date().toISOString();

    if (bestWeight != null) {
      const prev = existingByType.get('heaviest_weight') as number | undefined;
      if (prev == null || bestWeight > prev) {
        await upsertPR(userId, we.exercise_id, 'heaviest_weight', bestWeight, achievedAt, workoutId);
      }
    }
    if (bestVolume > 0) {
      const prev = existingByType.get('best_volume') as number | undefined;
      if (prev == null || bestVolume > prev) {
        await upsertPR(userId, we.exercise_id, 'best_volume', bestVolume, achievedAt, workoutId);
      }
    }
    if (bestRepsAtWeight != null) {
      const prev = existingByType.get('most_reps_at_weight') as { weight: number; reps: number } | undefined;
      const isBetter =
        prev == null ||
        bestRepsAtWeight.reps > prev.reps ||
        (bestRepsAtWeight.reps === prev.reps && bestRepsAtWeight.weight > prev.weight);
      if (isBetter) {
        await upsertPR(userId, we.exercise_id, 'most_reps_at_weight', bestRepsAtWeight, achievedAt, workoutId);
      }
    }
  }
}
