import { useState } from 'react';
import { useAuth } from '../lib/useAuth';
import { useProfile, useUpdateProfile, useProfileStats } from '../lib/queries/profile';
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
import { ConfirmDialog } from '../components/ConfirmDialog';
import { Sheet } from '../components/Sheet';
import { useToast } from '../lib/useToast';
import { formatMemberSince, getInitials } from '../lib/format';
import type { Exercise } from '../types/database';
import './Profile.css';

export function Profile() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const updateProfile = useUpdateProfile(user?.id);
  const { data: stats } = useProfileStats(user?.id);
  const { data: templates } = useTemplates(user?.id);
  const createTemplate = useCreateTemplate(user?.id);
  const updateTemplate = useUpdateTemplate(user?.id);
  const deleteTemplate = useDeleteTemplate(user?.id);
  const { toast } = useToast();

  const [newRoutineName, setNewRoutineName] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [exercisePickerForId, setExercisePickerForId] = useState<string | null>(null);
  const [showNewRoutine, setShowNewRoutine] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState('');

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

  const initials = getInitials(profile?.display_name, user?.email);

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

  const handleUnitsChange = (units: 'kg' | 'lb') => {
    updateProfile.mutate({ units });
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

  const handleStartEditDisplayName = () => {
    setDisplayNameDraft(profile?.display_name ?? '');
    setEditingDisplayName(true);
  };

  const handleSaveDisplayName = () => {
    const name = displayNameDraft.trim();
    updateProfile.mutate(
      { display_name: name || null },
      { onSuccess: () => setEditingDisplayName(false) },
    );
  };

  return (
    <div className="profile">
      {/* Header */}
      <header className="profile-header">
        <div className="profile-avatar">{initials}</div>
        <div className="profile-identity">
          {editingDisplayName ? (
            <div className="profile-name-edit">
              <input
                type="text"
                className="profile-name-input"
                value={displayNameDraft}
                onChange={(e) => setDisplayNameDraft(e.target.value)}
                placeholder="Your name"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleSaveDisplayName();
                  if (e.key === 'Escape') setEditingDisplayName(false);
                }}
              />
              <button
                type="button"
                className="btn-ghost"
                onClick={handleSaveDisplayName}
                disabled={updateProfile.isPending}
              >
                Save
              </button>
              <button
                type="button"
                className="btn-ghost"
                onClick={() => setEditingDisplayName(false)}
              >
                Cancel
              </button>
            </div>
          ) : (
            <button
              type="button"
              className="profile-name-btn"
              onClick={handleStartEditDisplayName}
            >
              <span className="profile-display-name">
                {profile?.display_name || 'Add your name'}
              </span>
              <span className="profile-name-edit-hint">Edit</span>
            </button>
          )}
          <span className="profile-email">{user?.email ?? '—'}</span>
          {profile?.created_at && (
            <span className="profile-member-since">
              Member since {formatMemberSince(profile.created_at)}
            </span>
          )}
        </div>
      </header>

      {/* Stats */}
      {stats && (stats.workouts > 0 || stats.exercises > 0 || stats.prs > 0) && (
        <section className="profile-stats">
          <div className="card profile-stat-card">
            <span className="profile-stat-value">{stats.workouts}</span>
            <span className="profile-stat-label">Workouts</span>
          </div>
          <div className="card profile-stat-card">
            <span className="profile-stat-value">{stats.exercises}</span>
            <span className="profile-stat-label">Exercises</span>
          </div>
          <div className="card profile-stat-card">
            <span className="profile-stat-value">{stats.prs}</span>
            <span className="profile-stat-label">PRs</span>
          </div>
        </section>
      )}

      {/* Settings */}
      <section className="card profile-card">
        <h2 className="profile-card-title">Settings</h2>
        <div className="profile-setting">
          <span className="profile-setting-label">Units</span>
          <div className="profile-units-toggle">
            <button
              type="button"
              className={
                'profile-unit' +
                (profile?.units === 'kg' ? ' profile-unit--active' : '')
              }
              onClick={() => handleUnitsChange('kg')}
            >
              kg
            </button>
            <button
              type="button"
              className={
                'profile-unit' +
                (profile?.units === 'lb' ? ' profile-unit--active' : '')
              }
              onClick={() => handleUnitsChange('lb')}
            >
              lb
            </button>
          </div>
        </div>
      </section>

      {/* Routines */}
      <section className="card profile-card">
        <div className="profile-card-header">
          <div>
            <h2 className="profile-card-title">Routines</h2>
            <p className="meta profile-card-desc">
              Workout templates for quick starts.
            </p>
          </div>
          <button
            type="button"
            className="btn-ghost profile-add-routine-toggle"
            onClick={() => setShowNewRoutine((v) => !v)}
          >
            {showNewRoutine ? 'Cancel' : '+ New'}
          </button>
        </div>
        {showNewRoutine && (
          <div className="profile-routine-new">
            <input
              type="text"
              placeholder="e.g. Push Day, Upper Body..."
              value={newRoutineName}
              onChange={(e) => setNewRoutineName(e.target.value)}
              className="profile-input"
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
          <ul className="profile-routine-list">
            {templates.map((t) => (
              <li key={t.id} className="profile-routine-item">
                {editingId === t.id ? (
                  <div className="profile-routine-edit">
                    <input
                      type="text"
                      value={editingName}
                      onChange={(e) => setEditingName(e.target.value)}
                      className="profile-input"
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
                    <div className="profile-routine-info">
                      <span className="profile-routine-name">{t.name}</span>
                      {t.exercise_order.length > 0 && (
                        <span className="profile-routine-badge">
                          {t.exercise_order.length} exercise{t.exercise_order.length !== 1 ? 's' : ''}
                        </span>
                      )}
                    </div>
                    <div className="profile-routine-actions">
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
      </section>

      {/* Sign out */}
      <div className="profile-signout">
        <button
          type="button"
          className="btn-ghost btn-ghost--danger profile-signout-btn"
          onClick={() => setConfirmSignOut(true)}
        >
          Sign out
        </button>
      </div>

      <Sheet
        open={exercisePickerForId !== null}
        onClose={() => setExercisePickerForId(null)}
        title={editingTemplate ? `${editingTemplate.name} — Exercises` : 'Exercises'}
      >
        {routineExercises.data && routineExercises.data.length > 0 && (
          <div style={{ marginBottom: 'var(--space-4)' }}>
            <p className="meta" style={{ marginBottom: 'var(--space-2)' }}>Current exercises</p>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              {routineExercises.data.map((e) => (
                <li
                  key={e.id}
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: 'var(--space-2) 0',
                    borderBottom: '0.5px solid var(--color-border)',
                  }}
                >
                  <span className="card-title">{e.name}</span>
                  <button
                    type="button"
                    className="btn-ghost"
                    style={{ color: 'var(--color-danger)' }}
                    onClick={() => handleRemoveExerciseFromRoutine(e.id)}
                  >
                    Remove
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}
        <p className="meta" style={{ marginBottom: 'var(--space-2)' }}>Add exercises</p>
        <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
          {availableExercises.map((e) => (
            <li key={e.id}>
              <button
                type="button"
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  width: '100%',
                  padding: 'var(--space-2) 0',
                  background: 'none',
                  border: 'none',
                  borderBottom: '0.5px solid var(--color-border)',
                  cursor: 'pointer',
                  textAlign: 'left',
                }}
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

      <ConfirmDialog
        open={confirmSignOut}
        title="Sign out"
        message="Are you sure you want to sign out?"
        confirmLabel="Sign out"
        onConfirm={() => { setConfirmSignOut(false); signOut(); }}
        onCancel={() => setConfirmSignOut(false)}
      />
    </div>
  );
}
