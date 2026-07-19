import { useCallback, useEffect, useMemo, useState } from 'react';

import type { ExerciseShape } from '@/components/activeSet';
import { effectiveRest, getOverrides } from '@/rest/overrides';

/**
 * Per-exercise rest override state + the effective rest duration for the
 * exercise under the cursor. Overrides load once on mount and reload after
 * the RestOverrideSheet commits a change.
 */
export function useRestOverrides(currentExercise: ExerciseShape | null) {
  const [overrides, setOverridesState] = useState<Record<string, number>>({});
  const [overrideSheetOpen, setOverrideSheetOpen] = useState(false);

  useEffect(() => {
    void getOverrides().then(setOverridesState);
  }, []);

  const reloadOverrides = useCallback(async () => {
    setOverridesState(await getOverrides());
  }, []);

  const restSeconds = useMemo(
    () =>
      effectiveRest(
        overrides,
        currentExercise?.exerciseId ?? '',
        currentExercise?.muscleGroup ?? null,
      ),
    [overrides, currentExercise?.exerciseId, currentExercise?.muscleGroup],
  );

  return { overrides, reloadOverrides, restSeconds, overrideSheetOpen, setOverrideSheetOpen };
}
