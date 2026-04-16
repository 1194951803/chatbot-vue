import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

// https://vite.dev/config/
export default defineConfig({
  base: '/chatbotui',
  plugins: [vue()],
  server: {
    port: 5173,
    /*proxy: {
      '/ai': {
        target: 'http://localhost:8088',
        changeOrigin: true,
      },
    },*/
  },
})