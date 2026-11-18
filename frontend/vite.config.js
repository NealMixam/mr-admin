import { defineConfig } from 'vite';

export default defineConfig({
  oxc: { jsx: { runtime: 'automatic' } },
  server: {
    proxy: { '/api': process.env.API_TARGET || 'http://127.0.0.1:3000' },
  },
});
