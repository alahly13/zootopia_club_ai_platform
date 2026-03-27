import React from 'react';
import { Toaster } from 'react-hot-toast';
import { useTheme } from '../themes/ThemeProvider';

export const ToastProvider: React.FC = () => {
  const { isDarkMode } = useTheme();

  return (
    <Toaster
      position="bottom-center"
      toastOptions={{
        duration: 3000,
        style: {
          background: isDarkMode ? '#18181b' : '#ffffff',
          color: isDarkMode ? '#ffffff' : '#18181b',
          border: isDarkMode ? '1px solid #27272a' : '1px solid #d4d4d8',
          borderRadius: '1rem',
          fontSize: '0.875rem',
          fontWeight: '500',
          boxShadow: isDarkMode
            ? '0 10px 24px rgba(0, 0, 0, 0.35)'
            : '0 10px 24px rgba(0, 0, 0, 0.12)',
        },
        success: {
          iconTheme: {
            primary: '#10b981',
            secondary: isDarkMode ? '#fff' : '#f9fafb',
          },
        },
        error: {
          iconTheme: {
            primary: '#ef4444',
            secondary: isDarkMode ? '#fff' : '#f9fafb',
          },
        },
      }}
    />
  );
};
