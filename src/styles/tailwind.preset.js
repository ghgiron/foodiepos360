/**
 * Preset de Tailwind (v3.4+ / compatible con v4 vía @config).
 * Los colores consumen las CSS variables de tokens.css, por lo que
 * cambiar data-theme="dark" | "glass" re-tematiza toda la UI sin recompilar.
 *
 * tailwind.config.js:
 *   module.exports = { presets: [require('./tailwind.preset.js')], content: [...] }
 */
const v = (name) => `var(--${name})`;

module.exports = {
  // Los colores semánticos ya cambian con data-theme; `dark:` solo es útil para ajustes puntuales.
  darkMode: ['selector', '[data-theme="dark"], [data-theme="glass"]'],
  theme: {
    extend: {
      colors: {
        canvas:   v('bg-canvas'),
        surface:  v('bg-surface'),
        raised:   v('bg-raised'),
        inset:    v('bg-inset'),
        overlay:  v('bg-overlay'),
        line: {
          subtle:  v('border-subtle'),
          DEFAULT: v('border-default'),
          strong:  v('border-strong'),
        },
        content: {
          DEFAULT:   v('text-primary'),
          secondary: v('text-secondary'),
          tertiary:  v('text-tertiary'),
          disabled:  v('text-disabled'),
          accent:    v('text-accent'),
          'on-accent': v('text-on-accent'),
        },
        accent: {
          DEFAULT: v('accent'),
          hover:   v('accent-hover'),
          pressed: v('accent-pressed'),
          subtle:  v('accent-subtle'),
        },
        secondary: { DEFAULT: v('secondary'), subtle: v('secondary-subtle') },

        /* Perfil POS (requiere tokens.pos.css). El naranja solo existe como "heat". */
        action: {
          DEFAULT: v('action-fill'), hover: v('action-hover'),
          pressed: v('action-pressed'), text: v('action-text'),
        },
        heat: {
          ok: v('heat-ok'), warm: v('heat-warm'), hot: v('heat-hot'), overdue: v('heat-overdue'),
          'warm-subtle': v('heat-warm-subtle'), 'hot-subtle': v('heat-hot-subtle'),
          'overdue-subtle': v('heat-overdue-subtle'), 'overdue-text': v('heat-overdue-text'),
        },
        table: {
          free: v('table-free'), occupied: v('table-occupied'), bill: v('table-bill'),
          ready: v('table-ready'), reserved: v('table-reserved'),
        },
        cream: { 50: '#FBF7F0', 100: '#F5EFE6', 200: '#E8DFD0' },
        success: { DEFAULT: v('success'), subtle: v('success-subtle') },
        danger:  { DEFAULT: v('danger'),  subtle: v('danger-subtle') },
        warning: { DEFAULT: v('warning'), subtle: v('warning-subtle') },
        info:    { DEFAULT: v('info'),    subtle: v('info-subtle') },

        /* Primitivos por si se necesitan fuera del tema */
        neutral: {
          0: '#FFFFFF', 50: '#FAFAFA', 100: '#F5F5F5', 200: '#E5E5E5', 300: '#D4D4D4',
          400: '#A3A3A3', 500: '#8A8A8A', 600: '#737373', 700: '#525252', 750: '#404040',
          800: '#373737', 850: '#262626', 900: '#171717', 950: '#0A0A0A', 1000: '#000000',
        },
        orange: {
          50: '#FFF4ED', 100: '#FFE6D5', 200: '#FFCCAA', 300: '#FFA874', 400: '#FF8A4C',
          500: '#FF6B2C', 600: '#F0511A', 700: '#C73E12', 800: '#9E3314', 900: '#7F2D14', 950: '#451407',
        },
        violet: { 300: '#C4B5FD', 400: '#A78BFA', 500: '#8B5CF6', 600: '#7C3AED', 700: '#6D28D9' },
      },
      fontFamily: {
        display: ['Manrope', 'Plus Jakarta Sans', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans:    ['Inter', 'SF Pro Text', '-apple-system', 'BlinkMacSystemFont', 'Segoe UI', 'system-ui', 'sans-serif'],
        mono:    ['ui-monospace', 'SF Mono', 'JetBrains Mono', 'Menlo', 'monospace'],
      },
      fontSize: {
        xs:   ['0.75rem',  { lineHeight: '1.25' }],
        sm:   ['0.875rem', { lineHeight: '1.5' }],
        base: ['1rem',     { lineHeight: '1.5' }],
        lg:   ['1.125rem', { lineHeight: '1.5' }],
        xl:   ['1.25rem',  { lineHeight: '1.25' }],
        '2xl':['1.5rem',   { lineHeight: '1.25' }],
        '3xl':['2rem',     { lineHeight: '1.25', letterSpacing: '-0.01em' }],
        '4xl':['2.5rem',   { lineHeight: '1.1',  letterSpacing: '-0.02em' }],
        '5xl':['3.5rem',   { lineHeight: '1.1',  letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        xs: '6px', sm: '8px', md: '12px', card: '12px', lg: '16px', 'card-lg': '16px', xl: '16px',
        '2xl': '16px', '3xl': '16px', full: '9999px',
      },
      backgroundImage: {
        'accent-gradient': 'var(--gradient-accent)',
        'accent-gradient-hover': 'var(--gradient-accent-hover)',
        'violet-gradient': 'var(--gradient-violet)',
        'page': 'var(--page-bg)',
      },
      boxShadow: {
        sm: v('shadow-sm'),
        md: v('shadow-md'),
        lg: v('shadow-lg'),
        'glow-accent': v('shadow-glow-accent'),
        highlight: 'inset 0 1px 0 rgba(255,255,255,0.18)',
      },
      backdropBlur: { sm: '8px', md: '16px', lg: '24px', xl: '40px' },
      /* Objetivos táctiles POS: h-touch, min-h-touch-lg, size-touch-key */
      spacing: { touch: '56px', 'touch-lg': '64px', 'touch-key': '72px' },
      transitionTimingFunction: {
        standard: 'cubic-bezier(0.2, 0, 0, 1)',
        emphasized: 'cubic-bezier(0.3, 0, 0, 1.2)',
      },
      transitionDuration: { fast: '120ms', normal: '200ms', slow: '360ms' },
    },
  },
  plugins: [
    /* Utilidades "glass-*" que replican el tema glass explícitamente,
       útiles para usar vidrio dentro del tema dark en piezas puntuales. */
    function ({ addUtilities }) {
      addUtilities({
        '.glass': {
          background: 'rgba(255,255,255,0.07)',
          border: '1px solid rgba(255,255,255,0.14)',
          'box-shadow': 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 32px rgba(0,0,0,0.45)',
          '-webkit-backdrop-filter': 'blur(24px) saturate(140%)',
          'backdrop-filter': 'blur(24px) saturate(140%)',
        },
        '.glass-strong': {
          background: 'rgba(255,255,255,0.11)',
          border: '1px solid rgba(255,255,255,0.28)',
          'box-shadow': 'inset 0 1px 0 rgba(255,255,255,0.18), 0 16px 48px rgba(0,0,0,0.55)',
          '-webkit-backdrop-filter': 'blur(40px) saturate(140%)',
          'backdrop-filter': 'blur(40px) saturate(140%)',
        },
      });
    },
  ],
};
