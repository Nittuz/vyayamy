import { useState, useRef, useEffect } from 'react';
import type { Set } from '../types/database';
import type { WorkoutExerciseWithMeta } from '../lib/queries/workouts';
import { CopyIcon, CheckIcon, XIcon, ChevronUpIcon, ChevronDownIcon, PlusIcon } from './Icons';
import { hapticTap } from '../lib/haptics';
import './ExerciseBlock.css';

type PreviousSet = { weight: number | null; reps: number | null };

type ExerciseBlockProps = {
  we: WorkoutExerciseWithMeta;
  units?: 'kg' | 'lb';
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
  hiddenSetIds?: ReadonlySet<string>;
  previousSets?: PreviousSet[];
};

export function ExerciseBlock({
  we,
  units = 'kg',
  onAddSet,
  onUpdateSet,
  onDeleteSet,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
  hiddenSetIds,
  previousSets,
}: ExerciseBlockProps) {
  const [expanded, setExpanded] = useState(true);
  const [editingField, setEditingField] = useState<{
    setId: string;
    field: 'weight' | 'reps';
  } | null>(null);
  const [editValue, setEditValue] = useState('');
  const [flashField, setFlashField] = useState<{ setId: string; field: 'weight' | 'reps' } | null>(null);
  const [removingSetId, setRemovingSetId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const skipBlurRef = useRef(false);
  const flashTimerRef = useRef<ReturnType<typeof setTimeout>>();

  const triggerFlash = (setId: string, field: 'weight' | 'reps') => {
    clearTimeout(flashTimerRef.current);
    setFlashField({ setId, field });
    flashTimerRef.current = setTimeout(() => setFlashField(null), 400);
  };

  useEffect(() => {
    if (editingField && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editingField]);

  const getGhost = (setIndex: number, field: 'weight' | 'reps'): number | null => {
    const prev = previousSets?.[setIndex];
    return prev ? (field === 'weight' ? prev.weight : prev.reps) : null;
  };

  const startEdit = (s: Set, field: 'weight' | 'reps') => {
    setEditingField({ setId: s.id, field });
    const current = field === 'weight' ? s.weight : s.reps;
    if (current != null) {
      setEditValue(current.toString());
    } else {
      const ghost = getGhost(visibleSets.indexOf(s), field);
      setEditValue(ghost?.toString() ?? '');
    }
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
    triggerFlash(editingField.setId, editingField.field);
    setEditingField(null);
  };

  const saveAndAdvance = (s: Set) => {
    if (!editingField) return;
    const raw = editValue.trim();
    const value = raw === '' ? null : Number(raw);
    if (value !== null && !Number.isNaN(value)) {
      onUpdateSet(editingField.setId, { [editingField.field]: value });
      triggerFlash(editingField.setId, editingField.field);
    }
    if (editingField.field === 'weight') {
      skipBlurRef.current = true;
      setEditingField({ setId: s.id, field: 'reps' });
      const repsVal = s.reps?.toString() ?? '';
      if (repsVal === '') {
        const ghost = getGhost(visibleSets.indexOf(s), 'reps');
        setEditValue(ghost?.toString() ?? '');
      } else {
        setEditValue(repsVal);
      }
    } else {
      setEditingField(null);
    }
  };

  const cancelEdit = () => setEditingField(null);

  const handleDeleteSet = (setId: string) => {
    if (!onDeleteSet) return;
    setRemovingSetId(setId);
    setTimeout(() => {
      onDeleteSet(setId);
      setRemovingSetId(null);
    }, 200);
  };

  const handleCopyPrevious = (index: number) => {
    if (index === 0) return;
    const prev = visibleSets[index - 1];
    const current = visibleSets[index];
    onUpdateSet(current.id, { weight: prev.weight, reps: prev.reps });
  };

  const handleFillFromLast = () => {
    if (!previousSets) return;
    for (let i = 0; i < visibleSets.length; i++) {
      const s = visibleSets[i];
      const prev = previousSets[i];
      if (!prev) continue;
      const updates: { weight?: number | null; reps?: number | null } = {};
      if (s.weight == null && prev.weight != null) updates.weight = prev.weight;
      if (s.reps == null && prev.reps != null) updates.reps = prev.reps;
      if (Object.keys(updates).length > 0) onUpdateSet(s.id, updates);
    }
  };

  const visibleSets = hiddenSetIds
    ? we.sets.filter((s) => !hiddenSetIds.has(s.id))
    : we.sets;

  const allDone = visibleSets.length > 0 && visibleSets.every((s) => s.completed);

  const hasFillable = previousSets && previousSets.length > 0 &&
    visibleSets.some((s, i) => {
      const prev = previousSets[i];
      return prev && (s.weight == null || s.reps == null) && (prev.weight != null || prev.reps != null);
    });

  return (
    <div className={'card exercise-block' + (allDone ? ' exercise-block--done' : '')}>
      <button
        type="button"
        className="exercise-block-head"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
      >
        <div className="exercise-block-head-text">
          <span className="card-title">{we.exercise.name}</span>
          {we.exercise.muscle_group != null && (
            <span className="tag tag--muted exercise-block-muscle">
              {we.exercise.muscle_group}
            </span>
          )}
        </div>
        <div className="exercise-block-head-meta">
          {hasFillable && (
            <button
              type="button"
              className="exercise-block-fill"
              onClick={(e) => { e.stopPropagation(); handleFillFromLast(); }}
            >
              Use last
            </button>
          )}
          {(onMoveUp || onMoveDown) && (!isFirst || !isLast) && (
            <div className="exercise-block-reorder" onClick={(e) => e.stopPropagation()}>
              {onMoveUp && !isFirst && (
                <button type="button" className="exercise-block-move" onClick={onMoveUp} aria-label="Move up">
                  <ChevronUpIcon size={16} strokeWidth={2.5} />
                </button>
              )}
              {onMoveDown && !isLast && (
                <button type="button" className="exercise-block-move" onClick={onMoveDown} aria-label="Move down">
                  <ChevronDownIcon size={16} strokeWidth={2.5} />
                </button>
              )}
            </div>
          )}
          <span className={'meta tabular' + (allDone ? ' exercise-block-sets-done' : '')}>
            {allDone && <CheckIcon size={12} strokeWidth={3} />}
            {visibleSets.length} sets
          </span>
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
            {visibleSets.map((s, i) => {
              const isEditing = editingField?.setId === s.id;
              const canCopy =
                i > 0 &&
                s.weight == null &&
                s.reps == null &&
                (visibleSets[i - 1].weight != null || visibleSets[i - 1].reps != null);
              const ghostW = s.weight == null ? getGhost(i, 'weight') : null;
              const ghostR = s.reps == null ? getGhost(i, 'reps') : null;

              return (
                <div
                  key={s.id}
                  className={
                    'set-row' +
                    (s.completed ? ' set-row--done' : '') +
                    (removingSetId === s.id ? ' set-row--removing' : '')
                  }
                >
                  <span className="set-col-idx">
                    <span className="set-row-idx-badge">{i + 1}</span>
                  </span>

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
                        className="input input--sm input--inline tabular"
                      />
                    ) : (
                      <button
                        type="button"
                        className={'set-row-value tabular' + (flashField?.setId === s.id && flashField.field === 'weight' ? ' set-row-value--flash' : '')}
                        onClick={() => startEdit(s, 'weight')}
                      >
                        {s.weight != null ? (
                          <>{s.weight}<span className="set-row-unit">{units}</span></>
                        ) : ghostW != null ? (
                          <span className="set-row-ghost">{ghostW}<span className="set-row-unit">{units}</span></span>
                        ) : (
                          <span className="set-row-placeholder">&mdash;</span>
                        )}
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
                        className="input input--sm input--inline tabular"
                      />
                    ) : (
                      <button
                        type="button"
                        className={'set-row-value tabular' + (flashField?.setId === s.id && flashField.field === 'reps' ? ' set-row-value--flash' : '')}
                        onClick={() => startEdit(s, 'reps')}
                      >
                        {s.reps != null ? (
                          <>{s.reps}<span className="set-row-unit">reps</span></>
                        ) : ghostR != null ? (
                          <span className="set-row-ghost">{ghostR}<span className="set-row-unit">reps</span></span>
                        ) : (
                          <span className="set-row-placeholder">&mdash;</span>
                        )}
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
                        <CopyIcon size={14} strokeWidth={2} />
                      </button>
                    )}
                    {onDeleteSet && visibleSets.length > 1 && (
                      <button
                        type="button"
                        className="set-row-delete"
                        onClick={() => handleDeleteSet(s.id)}
                        title="Delete set"
                        aria-label="Delete set"
                      >
                        <XIcon size={12} strokeWidth={2.5} />
                      </button>
                    )}
                    <button
                      type="button"
                      className={
                        'set-row-check' +
                        (s.completed ? ' set-row-check--done' : '')
                      }
                      onClick={() => {
                        if (!s.completed) hapticTap();
                        onUpdateSet(s.id, {
                          completed: !s.completed,
                          completed_at: s.completed
                            ? null
                            : new Date().toISOString(),
                        });
                      }}
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
            onClick={() => onAddSet(we.id, visibleSets.length)}
          >
            <PlusIcon size={14} strokeWidth={2.5} />
            Add set
          </button>
        </div>
      )}
    </div>
  );
}
