import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../lib/useAuth';
import { useToast } from '../lib/useToast';
import { track } from '../lib/analytics';
import { exportJSON, exportCSV } from '../lib/export';
import { useDeleteAllWorkouts } from '../lib/queries/workouts';
import { ConfirmDialog } from '../components/ConfirmDialog';
import { ChevronRightIcon } from '../components/Icons';
import { usePWAInstall } from '../lib/usePWAInstall';
import './PrivacyData.css';

export function PrivacyData() {
  const { user } = useAuth();
  const { toast } = useToast();
  const { canInstall } = usePWAInstall();
  const deleteAllWorkouts = useDeleteAllWorkouts(user?.id);

  const [exportingJSON, setExportingJSON] = useState(false);
  const [exportingCSV, setExportingCSV] = useState(false);
  const [confirmDeleteHistory, setConfirmDeleteHistory] = useState(false);

  const handleExportJSON = async () => {
    if (!user?.id) return;
    setExportingJSON(true);
    try {
      await exportJSON(user.id);
      track({ name: 'export_downloaded', properties: { format: 'json' } });
      toast('Export downloaded', 'success');
    } catch {
      toast('Export failed. Please try again.', 'error');
    } finally {
      setExportingJSON(false);
    }
  };

  const handleExportCSV = async () => {
    if (!user?.id) return;
    setExportingCSV(true);
    try {
      await exportCSV(user.id);
      track({ name: 'export_downloaded', properties: { format: 'csv' } });
      toast('CSV downloaded', 'success');
    } catch {
      toast('Export failed. Please try again.', 'error');
    } finally {
      setExportingCSV(false);
    }
  };

  const handleDeleteHistory = () => {
    setConfirmDeleteHistory(false);
    deleteAllWorkouts.mutate(undefined, {
      onSuccess: () => toast('Workout history deleted', 'success'),
      onError: () => toast('Failed to delete history. Please try again.', 'error'),
    });
  };

  return (
    <div className="privacy">
      <header className="privacy-header">
        <Link to="/profile" className="privacy-back meta">
          Profile
        </Link>
        <h1 className="privacy-title">Privacy & Data</h1>
      </header>

      {/* ── Your data ── */}
      <section className="card privacy-section">
        <h2 className="privacy-section-title">Your data</h2>
        <p className="privacy-body">
          Everything you log in Vyayamy — workouts, sets, exercises, templates,
          training plans, and personal records — is tied to your account and stored
          securely on our cloud infrastructure.
        </p>
        <p className="privacy-body">
          Your data is yours. We don't sell it, share it with third parties,
          or use it for advertising.
        </p>
      </section>

      {/* ── What syncs ── */}
      <section className="card privacy-section">
        <h2 className="privacy-section-title">What syncs</h2>
        <p className="privacy-body">
          When you're online, every change syncs immediately to the server:
        </p>
        <ul className="privacy-list">
          <li>Workouts and sets</li>
          <li>Exercises (including custom ones)</li>
          <li>Templates and training plans</li>
          <li>Personal records</li>
          <li>Profile preferences (name, units)</li>
        </ul>
        <p className="privacy-body">
          Each set you log or complete is saved to the server in real time.
          When you finish a workout, the complete session is confirmed and stored.
        </p>
      </section>

      {/* ── Offline behavior ── */}
      <section className="card privacy-section">
        <h2 className="privacy-section-title">Offline behavior</h2>
        <p className="privacy-body">
          {canInstall
            ? 'Vyayamy can be installed as an app on your device for faster access.'
            : 'When installed, Vyayamy works like a native app on your device.'}{' '}
          The app shell (screens, styles, icons) is cached locally so pages
          load instantly.
        </p>
        <p className="privacy-body">
          However, logging sets and saving workouts requires an internet
          connection. If you lose connectivity, the app will show an offline
          indicator and automatically retry when you reconnect.
        </p>
        <p className="privacy-body privacy-body--muted">
          We're working on full offline support for a future update. For now,
          make sure you have a connection when training.
        </p>
      </section>

      {/* ── Export ── */}
      <section className="card privacy-section">
        <h2 className="privacy-section-title">Export your data</h2>
        <p className="privacy-body">
          Download a complete copy of your training data at any time. Your export
          includes all workouts, sets, exercises, templates, plans, and personal
          records.
        </p>
        <div className="privacy-export-actions">
          <button
            type="button"
            className="btn-secondary privacy-export-btn"
            onClick={handleExportJSON}
            disabled={exportingJSON}
            aria-busy={exportingJSON}
          >
            {exportingJSON ? 'Exporting\u2026' : 'Download JSON'}
          </button>
          <button
            type="button"
            className="btn-secondary privacy-export-btn"
            onClick={handleExportCSV}
            disabled={exportingCSV}
            aria-busy={exportingCSV}
          >
            {exportingCSV ? 'Exporting\u2026' : 'Download CSV'}
          </button>
        </div>
        <p className="privacy-body privacy-body--muted">
          JSON contains your complete data in a structured format. CSV contains
          your workout history as a spreadsheet (one row per set).
        </p>
      </section>

      {/* ── What we collect ── */}
      <section className="card privacy-section">
        <h2 className="privacy-section-title">What we collect</h2>
        <p className="privacy-body">
          Vyayamy does not use analytics, tracking pixels, or third-party
          data services. We don't collect usage metrics, device fingerprints,
          or behavioral data.
        </p>
        <p className="privacy-body">
          The only data we store is what you explicitly enter: your workouts,
          exercises, and preferences. Your email is used solely for
          authentication.
        </p>
      </section>

      {/* ── Deletion ── */}
      <section className="card privacy-section privacy-section--danger">
        <h2 className="privacy-section-title">Delete your data</h2>
        <p className="privacy-body">
          You can permanently delete your workout history. This removes all
          workouts, sets, and personal records. Your templates, training
          plans, and account will remain.
        </p>
        <button
          type="button"
          className="btn-ghost btn-ghost--danger privacy-delete-btn"
          onClick={() => setConfirmDeleteHistory(true)}
          disabled={deleteAllWorkouts.isPending}
        >
          {deleteAllWorkouts.isPending ? 'Deleting\u2026' : 'Delete workout history'}
        </button>

        <div className="privacy-separator" />

        <h3 className="privacy-subsection-title">Delete account</h3>
        <p className="privacy-body">
          Full account deletion removes your profile, all data, and your
          login credentials. This action is permanent and cannot be undone.
        </p>
        <p className="privacy-body privacy-body--muted">
          Self-service account deletion is coming in a future update. In the
          meantime, you can export your data above and{' '}
          <a href="mailto:feedback@vyayamy.app?subject=Account%20Deletion%20Request" className="privacy-link">
            contact us
          </a>{' '}
          to request account removal.
        </p>
        {/* TODO(phase-5): Implement self-service account deletion via Supabase Edge Function
            calling admin.deleteUser(). Wire a ConfirmDialog here with email confirmation. */}
      </section>

      <footer className="privacy-footer">
        <Link to="/profile" className="privacy-footer-link meta">
          <ChevronRightIcon size={14} className="privacy-footer-chevron" />
          Back to Profile
        </Link>
      </footer>

      <ConfirmDialog
        open={confirmDeleteHistory}
        title="Delete workout history"
        message="This will permanently delete all your workouts, sets, and personal records. This action cannot be undone. Your templates and training plans will not be affected."
        confirmLabel="Delete history"
        destructive
        onConfirm={handleDeleteHistory}
        onCancel={() => setConfirmDeleteHistory(false)}
      />
    </div>
  );
}
