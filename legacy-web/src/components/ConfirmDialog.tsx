import { useCallback, useId } from 'react';
import { Sheet } from './Sheet';
import './ConfirmDialog.css';

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  destructive?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  destructive = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const descId = useId();

  const cancelRef = useCallback(
    (node: HTMLButtonElement | null) => {
      if (node && destructive) {
        requestAnimationFrame(() => node.focus());
      }
    },
    [destructive],
  );

  return (
    <Sheet open={open} onClose={onCancel} title={title} role="alertdialog" aria-describedby={descId}>
      <p id={descId} className="meta confirm-dialog-message">
        {message}
      </p>
      <div className="confirm-dialog-actions">
        <button
          ref={cancelRef}
          type="button"
          className="btn-secondary"
          onClick={onCancel}
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          className={destructive ? 'btn-danger' : 'btn-primary'}
          onClick={onConfirm}
        >
          {confirmLabel}
        </button>
      </div>
    </Sheet>
  );
}
