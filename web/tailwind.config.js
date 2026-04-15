/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['Manrope', 'system-ui', 'sans-serif'],
        body: ['Inter', 'system-ui', 'sans-serif']
      },
      colors: {
        // Precision Ledger palette (from DESIGN.md)
        surface:            '#f8f9fa',
        'surface-low':      '#f1f4f6',
        'surface-mid':      '#eaeff1',
        'surface-high':     '#e3e9ec',
        'surface-highest':  '#dbe4e7',
        'surface-lowest':   '#ffffff',
        primary:            '#005db6',
        'primary-dim':      '#0051a1',
        'primary-container':'#d6e3ff',
        'on-primary-container':'#001c3b',
        'on-surface':       '#2b3437',
        'on-surface-variant':'#586064',
        'outline-variant':  '#abb3b7',
        error:              '#ba1a1a',
        'error-container':  '#ffdad6',
        inverse:            '#0c0f10'
      },
      boxShadow: {
        ambient: '0 8px 24px rgba(43, 52, 55, 0.06)'
      },
      borderRadius: {
        sm: '0.125rem',
        md: '0.375rem',
        lg: '0.5rem'
      }
    }
  },
  plugins: []
};
