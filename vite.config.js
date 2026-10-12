import { defineConfig } from 'vite';
import { resolve } from 'node:path';

export default defineConfig({
  server: {
    port: 5173,
    // Needed so @imgly/background-removal can use SharedArrayBuffer for faster inference.
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp'
    }
  },
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        product: resolve(__dirname, 'product.html'),
        ar: resolve(__dirname, 'ar.html'),
        try: resolve(__dirname, 'try.html'),
        calibrate: resolve(__dirname, 'calibrate.html')
      }
    }
  }
});
