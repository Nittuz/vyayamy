import { useState, useRef, useEffect } from 'react';
import {
  useExercisesSearch,
  useRecentExerciseIds,
  useExercisesByIds,
  useGlobalExercises,
  useAddExerciseToWorkout,
  useCreateExercise,
} from '../lib/queries/exercises';
import { useDebouncedValue, useAnimatedPresence } from '../lib/hooks';
import type { Exercise } from '../types/database';
import { SearchIcon } from './Icons';
import './ExerciseSearchModal.css';

type ExerciseSearchModalProps = {
  open: boolean;
  onClose: () => void;
  workoutId: string | undefined;
  userId: string | undefined;
  orderIndex: number;
};

export function ExerciseSearchModal({
  open,
  onClose,
  workoutId,
  userId,
  orderIndex,
}: ExerciseSearchModalProps) {
  const [query, setQuery] = useState('');
  const debouncedQuery = useDebouncedValue(query, 250);
  const [creating, setCreating] = useState(false);
  const [customName, setCustomName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const { visible, closing } = useAnimatedPresence(open, 250);
  const searchResults = useExercisesSearch(userId, debouncedQuery);
  const recentIds = useRecentExerciseIds(userId, 8);
  const recentExercises = useExercisesByIds(recentIds.data ?? []);
  const globalExercises = useGlobalExercises(12);
  const addToWorkout = useAddExerciseToWorkout();
  const createExercise = useCreateExercise(userId);

  useEffect(() => {
    if (open) {
      const timer = setTimeout(() => inputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
  }, [open]);

  const resetAndClose = () => {
    setQuery('');
    setCreating(false);
    setCustomName('');
    onClose();
  };

  const handleSelect = async (exercise: Exercise) => {
    if (!workoutId) return;
    await addToWorkout.mutateAsync({
      workoutId,
      exerciseId: exercise.id,
      orderIndex,
    });
    resetAndClose();
  };

  const handleCreateCustom = async () => {
    const name = customName.trim();
    if (!name || !userId || !workoutId) return;
    const exercise = await createExercise.mutateAsync({ name });
    await addToWorkout.mutateAsync({
      workoutId,
      exerciseId: exercise.id,
      orderIndex,
    });
    resetAndClose();
  };

  const showSearch = query.trim().length > 0;
  const searchList = searchResults.data ?? [];
  const recentList = recentExercises.data ?? [];
  const commonList = globalExercises.data ?? [];

  if (!visible) return null;

  return (
    <div
      className={'esm-backdrop' + (closing ? ' esm-backdrop--closing' : '')}
      onClick={resetAndClose}
      role="presentation"
    >
      <div
        className={'esm-panel' + (closing ? ' esm-panel--closing' : '')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Add exercise"
      >
        <div className="esm-header">
          <div className="esm-search-wrap">
            <SearchIcon size={16} strokeWidth={2} className="esm-search-icon" />
            <input
              ref={inputRef}
              type="search"
              placeholder="Search exercises"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="esm-search-input"
              aria-label="Search exercises"
            />
          </div>
          <button type="button" className="btn-ghost" onClick={resetAndClose}>
            Cancel
          </button>
        </div>

        <div className="esm-body">
          {creating ? (
            <div className="esm-create">
              <label className="meta">Exercise name</label>
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="e.g. Cable Fly"
                className="input input--md input--bg"
                autoFocus
              />
              <div className="esm-create-actions">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setCreating(false)}
                >
                  Back
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => handleCreateCustom()}
                  disabled={!customName.trim() || createExercise.isPending}
                >
                  Add
                </button>
              </div>
            </div>
          ) : (
            <>
              {showSearch ? (
                <section className="esm-section">
                  <h2 className="esm-section-title meta">Results</h2>
                  {searchResults.isLoading ? (
                    <p className="meta esm-empty">Searching...</p>
                  ) : searchList.length === 0 ? (
                    <p className="meta esm-empty">No exercises found.</p>
                  ) : (
                    <ul className="esm-list">
                      {searchList.map((ex) => (
                        <li key={ex.id}>
                          <button
                            type="button"
                            className="esm-item"
                            onClick={() => handleSelect(ex)}
                            disabled={addToWorkout.isPending}
                          >
                            <span className="esm-item-name">{ex.name}</span>
                            {ex.muscle_group != null && (
                              <span className="esm-item-muscle meta">
                                {ex.muscle_group}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  )}
                </section>
              ) : (
                <>
                  {recentList.length > 0 && (
                    <section className="esm-section">
                      <h2 className="esm-section-title meta">Recent</h2>
                      <ul className="esm-list">
                        {recentList.map((ex) => (
                          <li key={ex.id}>
                            <button
                              type="button"
                              className="esm-item"
                              onClick={() => handleSelect(ex)}
                              disabled={addToWorkout.isPending}
                            >
                              <span className="esm-item-name">{ex.name}</span>
                              {ex.muscle_group != null && (
                                <span className="esm-item-muscle meta">
                                  {ex.muscle_group}
                                </span>
                              )}
                            </button>
                          </li>
                        ))}
                      </ul>
                    </section>
                  )}
                  <section className="esm-section">
                    <h2 className="esm-section-title meta">Common</h2>
                    <ul className="esm-list">
                      {commonList.map((ex) => (
                        <li key={ex.id}>
                          <button
                            type="button"
                            className="esm-item"
                            onClick={() => handleSelect(ex)}
                            disabled={addToWorkout.isPending}
                          >
                            <span className="esm-item-name">{ex.name}</span>
                            {ex.muscle_group != null && (
                              <span className="esm-item-muscle meta">
                                {ex.muscle_group}
                              </span>
                            )}
                          </button>
                        </li>
                      ))}
                    </ul>
                  </section>
                </>
              )}

              <button
                type="button"
                className="esm-create-link btn-ghost"
                onClick={() => setCreating(true)}
              >
                + Create custom exercise
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
