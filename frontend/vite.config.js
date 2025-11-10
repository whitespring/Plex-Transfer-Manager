import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Load configuration
const configPath = path.resolve(__dirname, '../backend/src/config/config.json')
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'))

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: config.vite.port,
    open: config.vite.open,
    proxy: {
      '/api': {
        target: config.vite.proxy.api,
        changeOrigin: true
      },
      '/socket.io': {
        target: config.vite.proxy.socket,
        changeOrigin: true,
        ws: true
      }
    }
  }
})
