import { createRequire } from 'module';
const require = createRequire(import.meta.url);

/** @type {import('tailwindcss').Config} */
export default {
    presets: [require('./tailwind.preset.js')],
    darkMode: 'class',
    content: [
        "./index.html",
        "./src/**/*.{js,ts,jsx,tsx}",
    ],
    theme: {
        extend: {
            borderRadius: {
                'xs': '6px',
                'sm': '8px',
                'input': '8px',
                'select': '8px',
                'md': '12px',
                'lg': '16px',
                'card': '16px',
                'xl': '20px',
                'card-lg': '20px',
                'full': '9999px',
            },
        },
    },
    plugins: [],
}
