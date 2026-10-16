import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'
import { liveDataApi } from './server/vitePlugin.ts'


// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), liveDataApi()],
  // Reachable from phones and other laptops on the same network.
  server: { host: true },
  preview: { host: true },
})
