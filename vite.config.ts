import path from 'path'
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 1420,
    strictPort: true,
  },
  build: {
    target: 'esnext',
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules')) {
            if (id.includes('react-router')) {
              return 'router-vendor'
            }
            if (id.includes('@tanstack/react-query')) {
              return 'query-vendor'
            }
            if (id.includes('react-hook-form') || id.includes('@hookform') || id.includes('zod')) {
              return 'form-vendor'
            }
            if (
              id.includes('@radix-ui/react-dialog')
              || id.includes('@radix-ui/react-dropdown-menu')
              || id.includes('@radix-ui/react-popover')
              || id.includes('@radix-ui/react-select')
              || id.includes('@radix-ui/react-tooltip')
            ) {
              return 'ui-overlay-vendor'
            }
            if (
              id.includes('@radix-ui/react-avatar')
              || id.includes('@radix-ui/react-collapsible')
              || id.includes('@radix-ui/react-label')
              || id.includes('@radix-ui/react-scroll-area')
              || id.includes('@radix-ui/react-separator')
              || id.includes('@radix-ui/react-slider')
              || id.includes('@radix-ui/react-slot')
              || id.includes('@radix-ui/react-switch')
              || id.includes('@radix-ui/react-tabs')
            ) {
              return 'ui-base-vendor'
            }
            if (id.includes('react-markdown') || id.includes('remark-gfm')) {
              return 'markdown-vendor'
            }
            if (id.includes('lucide-react')) {
              return 'icon-vendor'
            }
            if (
              id.includes('/react/') || id.includes('\\react\\')
              || id.includes('/react-dom/') || id.includes('\\react-dom\\')
              || id.includes('/scheduler/') || id.includes('\\scheduler\\')
            ) {
              return 'react-vendor'
            }
          }
        },
      },
    },
  },
  envPrefix: ['VITE_'],
})
