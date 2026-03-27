import { useCallback } from 'react';
import toast, { ToastOptions } from 'react-hot-toast';

export const useNotification = () => {
  const defaultOptions: ToastOptions = {
    duration: 3000,
  };

  const success = useCallback((message: string) => toast.success(message, { ...defaultOptions }), []);
  const error = useCallback((message: string) => toast.error(message, { ...defaultOptions }), []);
  const warning = useCallback((message: string) => toast(message, { 
    ...defaultOptions, 
    icon: '⚠️',
    style: { background: '#f59e0b', color: '#fff' } 
  }), []);
  const info = useCallback((message: string) => toast(message, { 
    ...defaultOptions, 
    icon: 'ℹ️',
    style: { background: '#3b82f6', color: '#fff' } 
  }), []);
  const loading = useCallback((message: string) => toast.loading(message, { duration: Infinity }), []);
  const dismiss = useCallback((toastId?: string) => toast.dismiss(toastId), []);

  return { success, error, warning, info, loading, dismiss };
};
