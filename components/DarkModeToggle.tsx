'use client';

import { useEffect, useState } from 'react';

export default function DarkModeToggle() {
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  useEffect(() => {
    // Run only on client
    try {
      const stored = localStorage.getItem('theme');
      if (stored === 'light' || stored === 'dark') {
        setTheme(stored as 'light' | 'dark');
        if (stored === 'dark') document.documentElement.classList.add('dark');
        else document.documentElement.classList.remove('dark');
        return;
      }
      // fallback to system preference when no stored value
      const prefersDark =
        window.matchMedia &&
        window.matchMedia('(prefers-color-scheme: dark)').matches;
      const initial = prefersDark ? 'dark' : 'light';
      setTheme(initial);
      if (initial === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
    } catch (e) {
      // ignore
    }
  }, []);

  const toggle = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    try {
      if (next === 'dark') document.documentElement.classList.add('dark');
      else document.documentElement.classList.remove('dark');
      localStorage.setItem('theme', next);
    } catch (e) {
      // ignore
    }
    setTheme(next);
  };

  return (
    <button
      onClick={toggle}
      aria-label={
        theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'
      }
      title={theme === 'dark' ? 'Light' : 'Dark'}
      className='p-2 rounded-md bg-gray-200/60 dark:bg-gray-800/60 hover:bg-gray-200 dark:hover:bg-gray-700 transition'
    >
      {theme === 'dark' ? (
        <svg
          xmlns='http://www.w3.org/2000/svg'
          className='h-5 w-5'
          viewBox='0 0 20 20'
          fill='currentColor'
        >
          <path d='M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zM10 16a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM4.22 4.22a1 1 0 011.42 0l.7.7a1 1 0 11-1.42 1.42l-.7-.7a1 1 0 010-1.42zM14.66 14.66a1 1 0 011.42 0l.7.7a1 1 0 11-1.42 1.42l-.7-.7a1 1 0 010-1.42zM2 10a1 1 0 011-1h1a1 1 0 110 2H3a1 1 0 01-1-1zM16 10a1 1 0 011-1h1a1 1 0 110 2h-1a1 1 0 01-1-1zM4.22 15.78a1 1 0 010-1.42l.7-.7a1 1 0 011.42 1.42l-.7.7a1 1 0 01-1.42 0zM14.66 5.34a1 1 0 010-1.42l.7-.7a1 1 0 011.42 1.42l-.7.7a1 1 0 01-1.42 0z' />
        </svg>
      ) : (
        <svg
          xmlns='http://www.w3.org/2000/svg'
          className='h-5 w-5'
          viewBox='0 0 20 20'
          fill='currentColor'
        >
          <path d='M17.293 13.293A8 8 0 116.707 2.707a7 7 0 1010.586 10.586z' />
        </svg>
      )}
    </button>
  );
}
