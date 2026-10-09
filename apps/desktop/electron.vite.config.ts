import { resolve } from 'node:path';
import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig(({ command }) => ({
  main: { plugins: [externalizeDepsPlugin({ exclude: ['@bcis/shared'] })] },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: { rollupOptions: { output: { format: 'cjs', entryFileNames: '[name].cjs' } } },
  },
  renderer: {
    build: { minify: true },
    resolve: { alias: { '@': resolve('src/renderer/src') } },
    server: { host: '127.0.0.1', port: 5173, strictPort: true },
    plugins: [react(), tailwindcss(), {
      name: 'bcis-content-security-policy',
      transformIndexHtml(html) {
        const policy = command === 'serve'
          ? "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; connect-src 'self' ws://127.0.0.1:5173; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'"
          : "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'none'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";
        return html.replace('__CSP__', policy);
      },
    }],
  },
}));
