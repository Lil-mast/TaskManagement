/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["class"],
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        parchment: '#f3e5c9',
        'vintage-brown': '#3e2723',
        'do-header': '#CF8D83',
        'decide-header': '#A5C2D1',
        'delegate-header': '#DFC184',
        'delete-header': '#BDBDBD',
        'card-border': '#6d5639',
        'vintage-red': '#6d2e2e',
        'vintage-blue-grey': '#546e7a',
        'vintage-cream': '#fcf5e5',
        'vintage-beige': '#efeadd',
        vintage: {
          red: '#8B3333',
          slate: '#456980',
          bg: '#F5F5F5',
          btn: '#752929',
          btnHover: '#5e2121',
        },
        border: "hsl(var(--border))",
        input: "hsl(var(--input))",
        ring: "hsl(var(--ring))",
        background: "hsl(var(--background))",
        foreground: "hsl(var(--foreground))",
        primary: {
          DEFAULT: "hsl(var(--primary))",
          foreground: "hsl(var(--primary-foreground))",
        },
        secondary: {
          DEFAULT: "hsl(var(--secondary))",
          foreground: "hsl(var(--secondary-foreground))",
        },
        destructive: {
          DEFAULT: "hsl(var(--destructive))",
          foreground: "hsl(var(--destructive-foreground))",
        },
        muted: {
          DEFAULT: "hsl(var(--muted))",
          foreground: "hsl(var(--muted-foreground))",
        },
        accent: {
          DEFAULT: "hsl(var(--accent))",
          foreground: "hsl(var(--accent-foreground))",
        },
        popover: {
          DEFAULT: "hsl(var(--popover))",
          foreground: "hsl(var(--popover-foreground))",
        },
        card: {
          DEFAULT: "hsl(var(--card))",
          foreground: "hsl(var(--card-foreground))",
        },
        sidebar: {
          DEFAULT: "hsl(var(--sidebar))",
          foreground: "hsl(var(--sidebar-foreground))",
          primary: "hsl(var(--sidebar-primary))",
          "primary-foreground": "hsl(var(--sidebar-primary-foreground))",
          accent: "hsl(var(--sidebar-accent))",
          "accent-foreground": "hsl(var(--sidebar-accent-foreground))",
          border: "hsl(var(--sidebar-border))",
          ring: "hsl(var(--sidebar-ring))",
        },
      },
      fontFamily: {
        serif: ['Merriweather', '"Playfair Display"', 'serif'],
        hand: ['"Caveat"', 'cursive'],
      },
      boxShadow: {
        'card-frame': 'inset 0 0 15px rgba(0,0,0,0.1), 0 4px 6px -1px rgba(0, 0, 0, 0.3), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        'inner-glow': 'inset 0 0 10px rgba(255,255,255,0.3)',
      },
    },
  },
  plugins: [],
}