/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: '#0b0a0f',
        charcoal: '#16141c',
        gold: { DEFAULT: '#c9a24a', light: '#f1d58a', dark: '#7a5a1e' },
        violet: { neon: '#b45cff', deep: '#4b1d7a' },
        toxic: '#7dff6a',
        crimson: '#b3122e',
      },
      fontFamily: {
        display: ['Cinzel', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
