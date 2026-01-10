import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import fs from 'fs'

// Read API port from dev config if available
function getApiPort(): number {
  try {
    const configPath = path.resolve(__dirname, '../.cacd-dev/config.json')
    const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'))
    return config.port || 3000
  } catch {
    return 3000
  }
}

const apiPort = getApiPort()

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    proxy: {
      '/api': `http://localhost:${apiPort}`,
      '/socket.io': {
        target: `ws://localhost:${apiPort}`,
        ws: true
      }
    }
  }
})
