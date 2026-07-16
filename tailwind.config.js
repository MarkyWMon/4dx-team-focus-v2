/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './index.tsx',
    './App.tsx',
    './components/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ['var(--body-font, Roboto)', 'sans-serif'],
        display: ['var(--title-font, Poppins)', 'sans-serif'],
      },
      colors: {
        brand: {
          red: 'var(--primary-color, #E30613)',
          darkRed: '#9E1B32',
          navy: 'var(--secondary-color, #003057)',
          green: 'var(--success-color, #82BC00)',
          orange: 'var(--warning-color, #F37A1F)',
        },
      },
      keyframes: {
        'fade-in': {
          from: { opacity: '0', transform: 'translateY(10px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s ease-out forwards',
      },
    },
  },
  plugins: [],
};
