import { useEffect } from 'react';
import { useAnimatedPresence } from '../lib/hooks';
import './Sheet.css';

type SheetProps = {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
};

export function Sheet({ open, onClose, title, children }: SheetProps) {
  const { visible, closing } = useAnimatedPresence(open, 250);

  useEffect(() => {
    if (visible) {
      const handler = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
      document.addEventListener('keydown', handler);
      document.body.style.overflow = 'hidden';
      return () => {
        document.removeEventListener('keydown', handler);
        document.body.style.overflow = '';
      };
    }
  }, [visible, onClose]);

  if (!visible) return null;

  return (
    <div
      className={'sheet-backdrop' + (closing ? ' sheet-backdrop--closing' : '')}
      onClick={onClose}
      role="presentation"
    >
      <div
        className={'sheet-panel' + (closing ? ' sheet-panel--closing' : '')}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={title ?? 'Panel'}
      >
        {title != null && (
          <div className="sheet-header">
            <h2 className="sheet-title">{title}</h2>
            <button
              type="button"
              className="btn-ghost"
              onClick={onClose}
              aria-label="Close"
            >
              Cancel
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}
