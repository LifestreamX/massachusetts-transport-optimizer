import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        primary: 'var(--primary)',
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        surface: 'var(--surface)',
        mbta: {
          red: '#DA291C',
          orange: '#ED8B00',
          blue: '#003DA5',
          green: '#00843D',
          purple: '#80276C',
          silver: '#A7A8AA',
          yellow: '#FFD100',
        },
      },
    },
  },
  plugins: [],
};
export default config;
