import { useCallback, useState, type ReactNode } from 'react';
import { ToastContext } from '../contexts/ToastContext';
import type { ToastAction } from '../contexts/ToastContext';
import './Toast.css';

type ToastType = 'info' | 'success' | 'error';

type Toast = {
  id: number;
  message: string;
  type: ToastType;
  leaving: boolean;
  action?: ToastAction;
};

let nextId = 0;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: number) => {
    setToasts((prev) =>
      prev.map((t) => (t.id === id ? { ...t, leaving: true } : t)),
    );
    setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 200);
  }, []);

  const toast = useCallback((message: string, type: ToastType = 'info', action?: ToastAction) => {
    const id = ++nextId;
    setToasts((prev) => [...prev, { id, message, type, leaving: false, action }]);
    const duration = action ? 4000 : 3000;
    setTimeout(() => dismiss(id), duration);
  }, [dismiss]);

  return (
    <ToastContext.Provider value={{ toast }}>
      {children}
      <div className="toast-container" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            className={`toast toast--${t.type}${t.leaving ? ' toast--leaving' : ''}`}
          >
            <span>{t.message}</span>
            {t.action && (
              <button
                type="button"
                className="toast-action"
                onClick={() => {
                  t.action!.onClick();
                  dismiss(t.id);
                }}
              >
                {t.action.label}
              </button>
            )}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
