/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['JetBrains Mono', 'Fira Code', 'monospace'],
      },
      colors: {
        brine: {
          bg: '#090B10',
          surface: '#11151F',
          card: '#151A27',
          hover: '#1C2333',
          border: '#232B3E',
          accent: '#F97316',
          emerald: '#10B981',
          cyan: '#06B6D4',
        }
      }
    },
  },
  plugins: [],
};
