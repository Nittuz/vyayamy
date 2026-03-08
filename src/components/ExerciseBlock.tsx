import { useState, useRef, useEffect } from 'react';
import type { Set } from '../types/database';
import type { WorkoutExerciseWithMeta } from '../lib/queries/workouts';
import { PlusIcon, CheckIcon } from './Icons';
import './ExerciseBlock.css';

type ExerciseBlockProps = {
  we: WorkoutExerciseWithMeta;
  onAddSet: (workoutExerciseId: string, orderIndex: number) => void;
  onUpdateSet: (
    setId: string,
    updates: { weight?: number | null; reps?: number | null; completed?: boolean; completed_at?: string | null }
  ) => void;
  onDeleteSet?: (setId: string) => void;
  onMoveUp?: () => void;
  onMoveDown?: () => void;
  isFirst?: boolean;
  isLast?: boolean;
};

export function ExerciseBlock({
  we,
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: ExerciseBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const [editingField, setEditingField] = useState<{
    setId: string;
    field: 'weight' | 'reps';
  } | null>(null);
  const [editValue, setEditValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurRef = useRef(false);

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  const startEdit = (s: Set, field: 'weight' | 'reps') => {
    setEditingField({ setId: s.id, field });
    setEditValue(
      field === 'weight'
        ? (s.weight?.toString() ?? '')
        : (s.reps?.toString() ?? '')
    );
  };

  const saveEdit = () => {
    if (!editingField) return;
    const raw = editValue.trim();
    const value = raw === '' ? null : Number(raw);
    if (value !== null && Number.isNaN(value)) {
      setEditingField(null);
      return;
    }
    onUpdateSet(editingField.setId, { [editingField.field]: value });
    setEditingField(null);
  };

  const saveAndAdvance = (s: Set) => {
    if (!editingField) return;
    const raw = editValue.trim();
    const value = raw === '' ? null : Number(raw);
    if (value !== null && !Number.isNaN(value)) {
      onUpdateSet(editingField.setId, { [editingField.field]: value });
    }
    if (editingField.field === 'weight') {
      skipBlurRef.current = true;
      setEditingField({ setId: s.id, field: 'reps' });
      setEditValue(s.reps?.toString() ?? '');
    } else {
      setEditingField(null);
    }
  };

  const cancelEdit = () => setEditingField(null);

  const handleCopyPrevious = (index: number) => {
    if (index === 0) return;
    const prev = we.sets[index - 1];
    const current = we.sets[index];
    onUpdateSet(current.id, { weight: prev.weight, reps: prev.reps });
  };

  return (
    <div className="card exercise-block">
      <button
        type="button"
        className="exercise-block-head"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className="exercise-block-head-text">
          <span className="card-title">{we.exercise.name}</span>
          {we.exercise.muscle_group != null && (
            <span className="meta exercise-block-muscle">
              {we.exercise.muscle_group}
            </span>
          )}
        </div>
        <div className="exercise-block-head-meta">
          {onMoveUp && !isFirst && (
            <button type="button" className="btn-ghost exercise-block-move" onClick={(e) => { e.stopPropagation(); onMoveUp(); }} aria-label="Move up">
              ↑
            </button>
          )}
          {onMoveDown && !isLast && (
            <button type="button" className="btn-ghost exercise-block-move" onClick={(e) => { e.stopPropagation(); onMoveDown(); }} aria-label="Move down">
              ↓
            </button>
          )}
          <span className="meta tabular">{we.sets.length} sets</span>
        </div>
      </button>

      {expanded && (
        <div className="exercise-block-body">
          <div className="exercise-block-col-labels meta">
            <span className="set-col-idx">Set</span>
            <span className="set-col-val">Weight</span>
            <span className="set-col-val">Reps</span>
            <span className="set-col-end" />
          </div>

          <div className="exercise-block-sets">
            {we.sets.map((s, i) => {
              const isEditing = editingField?.setId === s.id;
              const canCopy =
                i > 0 &&
                s.weight == null &&
                s.reps == null &&
                (we.sets[i - 1].weight != null || we.sets[i - 1].reps != null);

              return (
                <div
                  key={s.id}
                  className={
                    'set-row' + (s.completed ? ' set-row--done' : '')
                  }
                >
                  <span className="set-col-idx meta tabular">{i + 1}</span>

                  <div className="set-col-val">
                    {isEditing && editingField.field === 'weight' ? (
                      <input
                        ref={inputRef}
                        type="number"
                        inputMode="decimal"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => {
                          if (skipBlurRef.current) {
                            skipBlurRef.current = false;
                            return;
                          }
                          saveEdit();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveAndAdvance(s);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="set-row-input tabular"
                      />
                    ) : (
                      <button
                        type="button"
                        className="set-row-value tabular"
                        onClick={() => startEdit(s, 'weight')}
                      >
                        {s.weight != null ? s.weight : '—'}
                      </button>
                    )}
                  </div>

                  <div className="set-col-val">
                    {isEditing && editingField.field === 'reps' ? (
                      <input
                        ref={inputRef}
                        type="number"
                        inputMode="numeric"
                        value={editValue}
                        onChange={(e) => setEditValue(e.target.value)}
                        onBlur={() => {
                          if (skipBlurRef.current) {
                            skipBlurRef.current = false;
                            return;
                          }
                          saveEdit();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') saveAndAdvance(s);
                          if (e.key === 'Escape') cancelEdit();
                        }}
                        className="set-row-input tabular"
                      />
                    ) : (
                      <button
                        type="button"
                        className="set-row-value tabular"
                        onClick={() => startEdit(s, 'reps')}
                      >
                        {s.reps != null ? s.reps : '—'}
                      </button>
                    )}
                  </div>

                  <div className="set-col-end">
                    {canCopy && (
                      <button
                        type="button"
                        className="set-row-copy"
                        onClick={() => handleCopyPrevious(i)}
                        title="Copy previous set"
                        aria-label="Copy previous set"
                      >
                        <PlusIcon size={14} strokeWidth={2} />
                      </button>
                    )}
                    {onDeleteSet && we.sets.length > 1 && (
                      <button
                        type="button"
                        className="set-row-delete"
                        onClick={() => onDeleteSet(s.id)}
                        title="Delete set"
                        aria-label="Delete set"
                      >
                        ×
                      </button>
                    )}
                    <button
                      type="button"
                      className={
                        'set-row-check' +
                        (s.completed ? ' set-row-check--done' : '')
                      }
                      onClick={() =>
                        onUpdateSet(s.id, {
                          completed: !s.completed,
                          completed_at: s.completed
                            ? null
                            : new Date().toISOString(),
                        })
                      }
                      aria-pressed={s.completed}
                      title={s.completed ? 'Mark incomplete' : 'Mark complete'}
                    >
                      {s.completed && <CheckIcon size={14} strokeWidth={3} />}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>

          <button
            type="button"
            className="exercise-block-add-set"
            onClick={() => onAddSet(we.id, we.sets.length)}
          >
            + Add set
          </button>
        </div>
      )}
    </div>
  );
}
