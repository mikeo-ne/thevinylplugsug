/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}', './shared/**/*.js'],
  theme: {
    extend: {
      colors: {
        ink: '#121212',
        coal: '#171717',
        panel: '#1b1b1b',
        lime: {
          DEFAULT: '#CCFF00',
          soft: '#DFFF66',
          deep: '#A8D400',
        },
        bone: '#F4F4EF',
        muted: '#8E8E86',
      },
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'sans-serif'],
        display: ['"Space Grotesk"', 'Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      letterSpacing: {
        tightest: '-0.045em',
      },
      boxShadow: {
        lime: '0 0 0 1px rgba(204,255,0,0.35), 0 18px 60px -20px rgba(204,255,0,0.35)',
        panel: '0 30px 80px -40px rgba(0,0,0,0.9)',
        glow: '0 0 40px rgba(204,255,0,0.18)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
      keyframes: {
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0)' },
          '50%': { transform: 'translateY(-12px)' },
        },
        'fade-up': {
          from: { opacity: '0', transform: 'translateY(14px)' },
          to: { opacity: '1', transform: 'translateY(0)' },
        },
        'pulse-ring': {
          '0%': { transform: 'scale(0.9)', opacity: '0.7' },
          '70%': { transform: 'scale(1.6)', opacity: '0' },
          '100%': { transform: 'scale(1.6)', opacity: '0' },
        },
        marquee: {
          from: { transform: 'translateX(0)' },
          to: { transform: 'translateX(-50%)' },
        },
        shimmer: {
          '100%': { transform: 'translateX(100%)' },
        },
        'bar-grow': {
          from: { transform: 'scaleX(0)' },
          to: { transform: 'scaleX(1)' },
        },
      },
      animation: {
        'spin-slow': 'spin-slow 22s linear infinite',
        'spin-slower': 'spin-slow 48s linear infinite',
        float: 'float 7s ease-in-out infinite',
        'fade-up': 'fade-up 0.6s cubic-bezier(0.16, 1, 0.3, 1) both',
        'pulse-ring': 'pulse-ring 2.4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        marquee: 'marquee 38s linear infinite',
        shimmer: 'shimmer 1.8s infinite',
        'bar-grow': 'bar-grow 0.9s cubic-bezier(0.16, 1, 0.3, 1) both',
      },
    },
  },
  plugins: [],
};
