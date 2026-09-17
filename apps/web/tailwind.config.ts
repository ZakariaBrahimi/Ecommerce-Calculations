import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#102A43',
        teal: {
          DEFAULT: '#0F766E',
          strong: '#0B5C56',
          light: '#5EEAD4',
          tint: '#CCFBF1',
        },
        amber: '#B45309',
        'amber-tint': '#FEF3C7',
        emerald: '#059669',
        'emerald-tint': '#D1FAE5',
        indigo: '#4F46E5',
        'indigo-tint': '#E0E7FF',
        critical: '#DC2626',
        bg: '#F8FAFC',
        'ink-1': '#102A43',
        'ink-2': '#48607A',
        'ink-3': '#8296AC',
        border: '#E2E8F0',
      },
      fontFamily: {
        sora: ['var(--font-sora)', 'sans-serif'],
        sans: ['var(--font-plex-sans)', 'sans-serif'],
        mono: ['var(--font-plex-mono)', 'monospace'],
      },
      borderRadius: {
        lg: '20px',
        md: '14px',
      },
    },
  },
  plugins: [],
};

export default config;
