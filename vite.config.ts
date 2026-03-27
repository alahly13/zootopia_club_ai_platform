import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig, loadEnv} from 'vite';

export default defineConfig(({mode}) => {
  loadEnv(mode, '.', '');
  const isProduction = mode === 'production';
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
    },
    build: {
      sourcemap: false,
      minify: 'esbuild',
      reportCompressedSize: true,
      rollupOptions: {
        output: {
          manualChunks: {
            vendor: ['react', 'react-dom', 'lucide-react', 'recharts', 'motion'],
            firebase: ['firebase/app', 'firebase/auth', 'firebase/firestore'],
            pdf: ['jspdf', 'jspdf-autotable', 'pdfjs-dist'],
            utils: ['xlsx', 'mammoth', 'docx', 'canvas-confetti']
          }
        }
      },
      target: 'es2022',
    },
    esbuild: isProduction ? {
      drop: ['console', 'debugger'],
      legalComments: 'none',
    } : undefined,
    define: {
      __DEV__: JSON.stringify(!isProduction),
    }
  };
});
