/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  darkMode: 'class',
  theme: {
    extend: {
      keyframes: {
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'loading-pulse': {
          '0%, 100%': { opacity: '0.3' },
          '50%': { opacity: '0.15' },
        },
      },
      animation: {
        'loading-pulse': 'loading-pulse 2s ease-in-out infinite',
      },
    },
  },
  plugins: [],
}