import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import { defineConfig } from 'vite';

export default defineConfig(() => ({
  plugins: [react(), tailwindcss()],
  define: {
    'process.env.GOOGLE_MAPS_PLATFORM_KEY': JSON.stringify(process.env.GOOGLE_MAPS_PLATFORM_KEY || ''),
    __SVAYIRO_APP_TARGET__: JSON.stringify(process.env.VITE_APP_TARGET || 'all')
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, '.')
    }
  },
  server: {
    hmr: process.env.ENABLE_HMR === 'true' ? { port: Number(process.env.VITE_HMR_PORT || 24679) } : false,
    watch: process.env.ENABLE_HMR === 'true' ? {} : null
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('react') || id.includes('react-dom')) return 'vendor-react';
          if (id.includes('@vis.gl') || id.includes('leaflet')) return 'vendor-maps';
          if (id.includes('qrcode') || id.includes('html5-qrcode')) return 'vendor-qr';
          if (id.includes('lucide-react')) return 'vendor-icons';
          return 'vendor';
        }
      }
    }
  }
}));
