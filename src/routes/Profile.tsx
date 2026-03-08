import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useProfile, useUpdateProfile, useProfileStats } from '../lib/queries/profile';
import { useTemplates } from '../lib/queries/templates';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { formatMemberSince, getInitials } from '../lib/format';
import { ChevronRightIcon } from '../components/Icons';
import './Profile.css';

export function Profile() {
  const { user, signOut } = useAuth();
  const { data: profile } = useProfile(user?.id);
  const updateProfile = useUpdateProfile(user?.id);
  const { data: stats } = useProfileStats(user?.id);
  const { data: templates } = useTemplates(user?.id);

  const [confirmSignOut, setConfirmSignOut] = useState(false);
  const [editingDisplayName, setEditingDisplayName] = useState(false);
  const [displayNameDraft, setDisplayNameDraft] = useState('');

  const initials = getInitials(profile?.display_name, user?.email);

  const handleUnitsChange = (units: 'kg' | 'lb') => {
    updateProfile.mutate({ units });
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

  const routineCount = templates?.length ?? 0;

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
                className="input input--sm"
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

      {/* Routines link */}
      <Link to="/profile/routines" className="card profile-card profile-routines-link">
        <div className="profile-routines-link-content">
          <h2 className="profile-card-title">Routines</h2>
          <span className="meta">
            {routineCount > 0
              ? `${routineCount} routine${routineCount !== 1 ? 's' : ''}`
              : 'Create workout templates'}
          </span>
        </div>
        <ChevronRightIcon size={18} className="profile-routines-chevron" />
      </Link>

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
