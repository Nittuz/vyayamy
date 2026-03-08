import { useState } from 'react';
import { useAuth } from '../lib/useAuth';
import {
  useTemplates,
  useCreateTemplate,
  useUpdateTemplate,
  useDeleteTemplate,
} from '../lib/queries/templates';
import {
  useExercisesByIds,
  useGlobalExercises,
  useRecentExerciseIds,
} from '../lib/queries/exercises';
import { BackLink } from '../components/BackLink';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Sheet } from '../components/Sheet';
import { useToast } from '../lib/useToast';
import type { Exercise } from '../types/database';
import './Routines.css';

export function Routines() {
  const { user } = useAuth();
  const { data: templates } = useTemplates(user?.id);
  const createTemplate = useCreateTemplate(user?.id);
  const updateTemplate = useUpdateTemplate(user?.id);
  const deleteTemplate = useDeleteTemplate(user?.id);
  const { toast } = useToast();

  const [newRoutineName, setNewRoutineName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [exercisePickerForId, setExercisePickerForId] = useState<string | null>(null);
  const [showNewRoutine, setShowNewRoutine] = useState(false);

  const editingTemplate = templates?.find((t) => t.id === exercisePickerForId);
  const routineExerciseIds = editingTemplate?.exercise_order ?? [];
  const routineExercises = useExercisesByIds(routineExerciseIds);
  const recentIds = useRecentExerciseIds(user?.id, 10);
  const recentExercises = useExercisesByIds(recentIds.data ?? []);
  const globalExercises = useGlobalExercises(20);

  const availableExercises: Exercise[] = [];
  const seen = new Set(routineExerciseIds);
  for (const e of [...(recentExercises.data ?? []), ...(globalExercises.data ?? [])]) {
    if (!seen.has(e.id)) {
      seen.add(e.id);
      availableExercises.push(e);
    }
  }

  const handleCreateRoutine = async () => {
    const name = newRoutineName.trim();
    if (!name) return;
    await createTemplate.mutateAsync({ name, exercise_order: [] });
    setNewRoutineName('');
    setShowNewRoutine(false);
  };

  const handleSaveEdit = async () => {
    if (!editingId || !editingName.trim()) return;
    await updateTemplate.mutateAsync({
      id: editingId,
      name: editingName.trim(),
    });
    setEditingId(null);
    setEditingName('');
  };

  const handleDeleteRoutine = () => {
    if (!deleteId) return;
    deleteTemplate.mutate(deleteId, {
      onSuccess: () => toast('Routine deleted', 'success'),
      onError: () => toast('Failed to delete routine', 'error'),
    });
    setDeleteId(null);
  };

  const handleAddExerciseToRoutine = (exerciseId: string) => {
    if (!exercisePickerForId || !editingTemplate) return;
    updateTemplate.mutate({
      id: exercisePickerForId,
      exercise_order: [...routineExerciseIds, exerciseId],
    });
  };

  const handleRemoveExerciseFromRoutine = (exerciseId: string) => {
    if (!exercisePickerForId || !editingTemplate) return;
    updateTemplate.mutate({
      id: exercisePickerForId,
      exercise_order: routineExerciseIds.filter((id) => id !== exerciseId),
    });
  };

  return (
    <div className="routines">
      <BackLink to="/profile" label="Profile" />

      <header className="routines-header">
        <h1 className="page-title">Routines</h1>
        <button
          type="button"
          className="btn-ghost routines-add-toggle"
          onClick={() => setShowNewRoutine((v) => !v)}
        >
          {showNewRoutine ? 'Cancel' : '+ New'}
        </button>
      </header>
      <p className="meta routines-desc">Workout templates for quick starts.</p>

      {showNewRoutine && (
        <div className="routines-new">
          <input
            type="text"
            placeholder="e.g. Push Day, Upper Body..."
            value={newRoutineName}
            onChange={(e) => setNewRoutineName(e.target.value)}
            className="input input--md input--bg"
            autoFocus
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleCreateRoutine();
              if (e.key === 'Escape') {
                setShowNewRoutine(false);
                setNewRoutineName('');
              }
            }}
          />
          <button
            type="button"
            className="btn-primary"
            onClick={() => handleCreateRoutine()}
            disabled={!newRoutineName.trim() || createTemplate.isPending}
          >
            {createTemplate.isPending ? 'Adding...' : 'Create routine'}
          </button>
        </div>
      )}

      {templates != null && templates.length > 0 && (
        <ul className="routines-list">
          {templates.map((t) => (
            <li key={t.id} className="routines-item">
              {editingId === t.id ? (
                <div className="routines-edit">
                  <input
                    type="text"
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="input input--md input--bg"
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') handleSaveEdit();
                      if (e.key === 'Escape') setEditingId(null);
                    }}
                  />
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => handleSaveEdit()}
                    disabled={updateTemplate.isPending}
                  >
                    Save
                  </button>
                  <button
                    type="button"
                    className="btn-ghost"
                    onClick={() => setEditingId(null)}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <>
                  <div className="routines-info">
                    <span className="routines-name">{t.name}</span>
                    {t.exercise_order.length > 0 && (
                      <span className="tag tag--muted">
                        {t.exercise_order.length} exercise{t.exercise_order.length !== 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  <div className="routines-actions">
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => setExercisePickerForId(t.id)}
                    >
                      Exercises
                    </button>
                    <button
                      type="button"
                      className="btn-ghost"
                      onClick={() => {
                        setEditingId(t.id);
                        setEditingName(t.name);
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      className="btn-ghost btn-ghost--danger"
                      onClick={() => setDeleteId(t.id)}
                      disabled={deleteTemplate.isPending}
                    >
                      Delete
                    </button>
                  </div>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {templates != null && templates.length === 0 && !showNewRoutine && (
        <div className="card card--empty routines-empty">
          <p className="meta">No routines yet. Tap "+ New" to create one.</p>
        </div>
      )}

      <Sheet
        open={exercisePickerForId !== null}
        onClose={() => setExercisePickerForId(null)}
        title={editingTemplate ? `${editingTemplate.name} — Exercises` : 'Exercises'}
      >
        {routineExercises.data && routineExercises.data.length > 0 && (
          <div className="routines-picker-section">
            <p className="meta routines-picker-label">Current exercises</p>
            <ul className="routines-picker-list">
              {routineExercises.data.map((e) => (
                <li key={e.id} className="routines-picker-item">
                  <span className="card-title">{e.name}</span>
                  <button
                    type="button"
                    className="btn-ghost btn-ghost--danger"
                    onClick={() => handleRemoveExerciseFromRoutine(e.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="meta routines-picker-label">Add exercises</p>
        <ul className="routines-picker-list">
          {availableExercises.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                className="routines-picker-add-btn"
                onClick={() => handleAddExerciseToRoutine(e.id)}
              >
                <span className="card-title">{e.name}</span>
                {e.muscle_group && <span className="meta">{e.muscle_group}</span>}
              </button>
            </li>
          ))}
        </ul>
      </Sheet>

      <ConfirmDialog
        open={deleteId !== null}
        title="Delete routine"
        message="Are you sure you want to delete this routine? This cannot be undone."
        confirmLabel="Delete"
        destructive
        onConfirm={handleDeleteRoutine}
        onCancel={() => setDeleteId(null)}
      />
    </div>
  );
}
