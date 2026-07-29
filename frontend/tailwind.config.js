/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        // Verde lima de la marca ("market") — acento principal · base #b8c030
        brand: {
          50:  '#fafcf2',
          100: '#f2f4da',
          200: '#e6e9b6',
          300: '#d8dc8d',
          400: '#c9cf63',
          500: '#b8c030',
          600: '#9ca329',
          700: '#818622',
          800: '#656a1a',
          900: '#4d5114',
        },
        // Verde oscuro de la marca ("teja") — textos/encabezados/fondos · base #2c3c34
        teja: {
          DEFAULT: '#2c3c34',
          500: '#525f59',
          600: '#2c3c34',
          700: '#23302a',
          800: '#1b2520',
          900: '#121916',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      animation: {
        'fade-in':    'fadeIn 0.3s ease-out',
        'slide-up':   'slideUp 0.3s ease-out',
        'pulse-soft': 'pulseSoft 2s ease-in-out infinite',
      },
      keyframes: {
        fadeIn:    { from: { opacity: 0 }, to: { opacity: 1 } },
        slideUp:   { from: { opacity: 0, transform: 'translateY(12px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
        pulseSoft: { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.7 } },
      },
    },
  },
  plugins: [],
}
