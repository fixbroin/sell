
"use client";

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Moon, Sun } from 'lucide-react';

const THEME_STORAGE_KEY = 'yourbrand-theme';

export default function ThemeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark' | null>(null); // Start with null to indicate loading

  // Effect to set initial theme from localStorage and apply it
  useEffect(() => {
    let initialTheme: 'light' | 'dark' = 'light';
    try {
      const storedTheme = localStorage.getItem(THEME_STORAGE_KEY) as 'light' | 'dark' | null;
      if (storedTheme === 'light' || storedTheme === 'dark') {
        initialTheme = storedTheme;
      }
    } catch (e) {
      console.warn('ThemeToggle: Error accessing localStorage for initial theme.', e);
    }
    
    // Apply initial theme to DOM immediately
    if (initialTheme === 'dark') {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    
    setTheme(initialTheme);
  }, []);

  // Effect to apply theme changes to DOM and localStorage after user interaction
  useEffect(() => {
    if (!theme || typeof window === 'undefined') return;

    const isDarkMode = theme === 'dark';
    document.documentElement.classList.toggle('dark', isDarkMode);
    
    try {
      localStorage.setItem(THEME_STORAGE_KEY, theme);
      window.dispatchEvent(new CustomEvent('themeChanged', { detail: { theme } }));
    } catch (e) {
      console.warn('ThemeToggle: Error syncing theme change.', e);
    }
  }, [theme]);

  const toggleTheme = () => {
    setTheme(prevTheme => (prevTheme === 'dark' ? 'light' : 'dark'));
  };

  // Render a placeholder or nothing while theme is initializing to avoid flicker
  if (!theme) return <div className="h-10 w-10" />;

  return (
    <Button 
      variant="ghost" 
      size="icon" 
      onClick={toggleTheme} 
      className="rounded-full bg-muted/50 hover:bg-primary hover:text-primary-foreground shadow-none h-10 w-10 transition-all duration-300"
      aria-label={`Switch to ${theme === 'light' ? 'dark' : 'light'} mode`}
    >
      {theme === 'light' ? <Moon className="h-5 w-5" /> : <Sun className="h-5 w-5" />}
    </Button>
  );
}
