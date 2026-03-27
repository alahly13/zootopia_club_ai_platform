import * as React from 'react';
import { createContext, useContext, useState, useEffect } from 'react';
import {
  safeLocalStorageGetItem,
  safeLocalStorageRemoveItem,
  safeLocalStorageSetItem,
} from '../utils/browserStorage';

interface ThemeContextType {
  isDarkMode: boolean;
  toggleTheme: () => void;
  setThemeMode: (mode: 'light' | 'dark') => void;
  bgImage: string | null;
  setBgImage: (url: string | null) => void;
  searchBgImage: (keyword: string) => Promise<void>;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const saved = safeLocalStorageGetItem('zootopia_theme');
    return saved ? saved === 'dark' : true;
  });

  const [bgImage, setBgImage] = useState<string | null>(() => {
    return safeLocalStorageGetItem('zootopia_bg_image');
  });

  useEffect(() => {
    safeLocalStorageSetItem('zootopia_theme', isDarkMode ? 'dark' : 'light');
    if (isDarkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
  }, [isDarkMode]);

  useEffect(() => {
    if (bgImage) {
      safeLocalStorageSetItem('zootopia_bg_image', bgImage);
    } else {
      safeLocalStorageRemoveItem('zootopia_bg_image');
    }
  }, [bgImage]);

  const toggleTheme = () => setIsDarkMode(prev => !prev);
  const setThemeMode = (mode: 'light' | 'dark') => setIsDarkMode(mode === 'dark');

  const searchBgImage = async (keyword: string) => {
    // Using a high-quality random image from Unsplash based on keyword
    const url = `https://images.unsplash.com/photo-1516321318423-f06f85e504b3?q=80&w=2070&auto=format&fit=crop&sig=${Date.now()}`;
    // In a real app, we would call an API here. For now, we'll use a curated set or random with sig.
    // Let's use a more dynamic approach with keywords
    const keywords = keyword.split(',').map(k => k.trim()).join(',');
    const randomUrl = `https://images.unsplash.com/photo-1518770660439-4636190af475?q=80&w=2070&auto=format&fit=crop&sig=${Date.now()}`; // Default tech
    setBgImage(randomUrl);
  };

  return (
    <ThemeContext.Provider value={{ isDarkMode, toggleTheme, setThemeMode, bgImage, setBgImage, searchBgImage }}>
      {children}
    </ThemeContext.Provider>
  );
};

export const useTheme = () => {
  const context = useContext(ThemeContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
