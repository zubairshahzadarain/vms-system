/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        surface: {
          950: '#04070d',
          900: '#080d18',
          850: '#0c1322',
          800: '#111a2e',
          700: '#1a2740',
          650: '#233355',
          600: '#2c3e60',
        },
        accent: {
          DEFAULT: '#22d3ee',
          dim: '#0891b2',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace'],
      },
    },
  },
  plugins: [],
};
