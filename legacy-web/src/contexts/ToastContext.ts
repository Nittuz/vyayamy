import { createContext } from 'react';

type ToastType = 'info' | 'success' | 'error';

export type ToastAction = { label: string; onClick: () => void };

export type ToastContextValue = {
  toast: (message: string, type?: ToastType, action?: ToastAction) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);
