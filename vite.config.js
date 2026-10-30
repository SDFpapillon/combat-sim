import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// base = nom du dépôt GitHub (pour GitHub Pages : https://sdfpapillon.github.io/combat-sim/)
export default defineConfig({
  base: '/combat-sim/',
  plugins: [vue()],
  test: { include: ['tests/**/*.test.js'] },
})
