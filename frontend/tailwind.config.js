/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        primary: '#3B82F6',
        warm: '#F59E0B',
        danger: '#EF4444',
        calm: '#10B981',
      },
    },
  },
  plugins: [],
}
