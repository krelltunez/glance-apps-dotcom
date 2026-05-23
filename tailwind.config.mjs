import typography from '@tailwindcss/typography';
import defaultTheme from 'tailwindcss/defaultTheme';

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./src/**/*.{astro,html,js,jsx,md,mdx,ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"Lora Variable"', 'Lora', ...defaultTheme.fontFamily.serif],
        sans: ['system-ui', ...defaultTheme.fontFamily.sans],
      },
      colors: {
        glance: {
          bg:           '#0D0D12',
          surface:      '#15151D',
          elevated:     '#1C1C27',
          border:       '#2A2A3A',
          'border-dim': '#1E1E2C',
          text:         '#E6E0D4',
          muted:        '#8C8799',
          dim:          '#5A5568',
          accent:       '#fe8b00',
          'accent-dim': '#d97600',
          link:         '#fe8b00',
        },
      },
      typography: (theme) => ({
        glance: {
          css: {
            '--tw-prose-body':        theme('colors.glance.text'),
            '--tw-prose-headings':    theme('colors.glance.text'),
            '--tw-prose-lead':        theme('colors.glance.muted'),
            '--tw-prose-links':       theme('colors.glance.accent'),
            '--tw-prose-bold':        theme('colors.glance.text'),
            '--tw-prose-counters':    theme('colors.glance.muted'),
            '--tw-prose-bullets':     theme('colors.glance.dim'),
            '--tw-prose-hr':          theme('colors.glance.border'),
            '--tw-prose-quotes':      theme('colors.glance.text'),
            '--tw-prose-quote-borders': theme('colors.glance.accent'),
            '--tw-prose-captions':    theme('colors.glance.muted'),
            '--tw-prose-code':        theme('colors.glance.text'),
            '--tw-prose-pre-code':    theme('colors.glance.text'),
            '--tw-prose-pre-bg':      theme('colors.glance.surface'),
            '--tw-prose-th-borders':  theme('colors.glance.border'),
            '--tw-prose-td-borders':  theme('colors.glance.border-dim'),
            maxWidth: 'none',
            fontFamily: theme('fontFamily.serif').join(', '),
            'h1, h2, h3, h4': {
              fontFamily: theme('fontFamily.serif').join(', '),
              fontWeight: '600',
            },
            'a': {
              textDecoration: 'underline',
              textDecorationColor: theme('colors.glance.accent') + '60',
              textUnderlineOffset: '3px',
              '&:hover': {
                textDecorationColor: theme('colors.glance.accent'),
              },
            },
          },
        },
      }),
    },
  },
  plugins: [typography],
};
