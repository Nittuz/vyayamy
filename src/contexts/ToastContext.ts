import { createContext } from 'react';

type ToastType = 'info' | 'success' | 'error';

export type ToastContextValue = {
  toast: (message: string, type?: ToastType) => void;
};

export const ToastContext = createContext<ToastContextValue | null>(null);
