import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const config: Config = {
  darkMode: ['class'],
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    './lib/**/*.{ts,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '2rem',
      screens: { '2xl': '1400px' },
    },
    extend: {
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        // A soft, diffused shadow scale (low-opacity, large blur, minimal spread) rather than
        // Tailwind's default harsher/darker shadows — the "floating card" look Intercom's panels
        // use. Tinted toward the brand blue instead of pure black for a warmer, on-brand feel.
        soft: '0 1px 2px 0 hsl(234 30% 20% / 0.04), 0 2px 8px -2px hsl(234 30% 20% / 0.06)',
        'soft-md': '0 2px 4px 0 hsl(234 30% 20% / 0.04), 0 8px 24px -4px hsl(234 30% 20% / 0.08)',
        'soft-lg': '0 4px 8px 0 hsl(234 30% 20% / 0.04), 0 16px 40px -8px hsl(234 30% 20% / 0.12)',
        glow: '0 0 0 1px hsl(var(--primary) / 0.05), 0 8px 24px -4px hsl(var(--primary) / 0.25)',
      },
      colors: {
        border: 'hsl(var(--border))',
        input: 'hsl(var(--input))',
        ring: 'hsl(var(--ring))',
        background: 'hsl(var(--background))',
        foreground: 'hsl(var(--foreground))',
        primary: {
          DEFAULT: 'hsl(var(--primary))',
          foreground: 'hsl(var(--primary-foreground))',
        },
        secondary: {
          DEFAULT: 'hsl(var(--secondary))',
          foreground: 'hsl(var(--secondary-foreground))',
        },
        destructive: {
          DEFAULT: 'hsl(var(--destructive))',
          foreground: 'hsl(var(--destructive-foreground))',
        },
        muted: {
          DEFAULT: 'hsl(var(--muted))',
          foreground: 'hsl(var(--muted-foreground))',
        },
        accent: {
          DEFAULT: 'hsl(var(--accent))',
          foreground: 'hsl(var(--accent-foreground))',
        },
      },
      borderRadius: {
        lg: 'var(--radius)',
        md: 'calc(var(--radius) - 2px)',
        sm: 'calc(var(--radius) - 4px)',
      },
      keyframes: {
        // KAN-67's war-room confetti burst (`confetti-burst.tsx`): each
        // particle falls from just above the viewport to just below it while
        // spinning, driven purely by a CSS animation (no canvas/animation
        // library) so it's paused for free whenever `prefers-reduced-motion`
        // is honored (that component skips rendering particles at all in
        // that case rather than relying on this keyframe not firing).
        'confetti-fall': {
          '0%': { transform: 'translateY(-10vh) rotate(0deg)', opacity: '1' },
          '100%': { transform: 'translateY(110vh) rotate(720deg)', opacity: '0.3' },
        },
      },
      animation: {
        'confetti-fall': 'confetti-fall linear forwards',
      },
    },
  },
  plugins: [animate],
};

export default config;
