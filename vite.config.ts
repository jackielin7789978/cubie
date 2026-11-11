/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// PORT 環境變數讓多個 worktree 可以同時各跑一個 dev server
const port = Number(process.env.PORT ?? 5173)

// base 設成 /cubie/，因為 GitHub Pages 的網址是 https://<帳號>.github.io/cubie/
export default defineConfig({
  base: '/cubie/',
  plugins: [react()],
  server: { port, strictPort: true },
  preview: { port: 4174, strictPort: true },
  test: {
    include: ['src/**/*.test.{ts,tsx}'],
    environment: 'node',
  },
})
