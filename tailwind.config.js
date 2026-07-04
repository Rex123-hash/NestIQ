/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        brand: {
          50: '#F3F1FE',
          100: '#E9E5FD',
          200: '#D6CCFB',
          300: '#BBA8F7',
          400: '#997EF1',
          500: '#7C5CF6',
          600: '#6D5EF6',
          700: '#5B45E8',
          800: '#4A37C0',
          900: '#3B2C97',
        },
        ink: {
          DEFAULT: '#1B1B2F',
          soft: '#2E2E45',
        },
        muted: '#6B7280',
        line: '#ECECF3',
        page: '#FCFCFE',
        band: '#F6F4FF',
        // sub-score accent colors
        aff: '#3FB984',
        safe: '#7C5CF6',
        commute: '#4F86F7',
        life: '#EC6FA6',
        trend: '#F5A63B',
      },
      fontFamily: {
        serif: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        card: '0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.06)',
        float: '0 8px 30px rgba(16,24,40,0.12)',
      },
      borderRadius: {
        xl: '0.9rem',
        '2xl': '1.25rem',
      },
    },
  },
  plugins: [],
}
