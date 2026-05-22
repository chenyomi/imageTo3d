import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // GitHub Pages 部署时由 CI 注入 VITE_BASE_URL（如 /imageTo3d/）
  base: process.env.VITE_BASE_URL ?? '/',
})
