/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx,ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#070b08',
        panel: '#101611',
        panelSoft: '#151d17',
        acid: '#35ff87',
        lime: '#ccff33',
        mint: '#8affc1',
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['Unbounded', 'Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        acid: '0 0 44px rgba(53, 255, 135, 0.22)',
        lime: '0 0 40px rgba(204, 255, 51, 0.16)',
        panel: '0 24px 80px rgba(0, 0, 0, 0.42)',
      },
      backgroundImage: {
        'grid-faint':
          'linear-gradient(rgba(113,255,159,.035) 1px, transparent 1px), linear-gradient(90deg, rgba(113,255,159,.035) 1px, transparent 1px)',
      },
    },
  },
  plugins: [],
}
