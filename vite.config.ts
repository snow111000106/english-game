import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const isTest = mode === 'test'
  const appEnv = isTest ? 'test' : 'prod'
  const apiPort = isTest ? 6174 : 6173

  return {
    plugins: [react()],
    server: {
      host: 'localhost',
      port: isTest ? 5174 : 5173,
      strictPort: true,
    },
    preview: {
      host: 'localhost',
      port: isTest ? 4174 : 4173,
      strictPort: true,
    },
    define: {
      __APP_ENV__: JSON.stringify(appEnv),
      __APP_API_BASE__: JSON.stringify(`http://localhost:${apiPort}`),
    },
  }
})
